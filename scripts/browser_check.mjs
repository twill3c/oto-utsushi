#!/usr/bin/env node
// =====================================================================
// 実ブラウザ検品 — verify の緑が「動くこと」を意味しないので、別に置く
//
// 静的書き出し(out/)をそのまま配って Chromium で開き、
// **本物の経路**を通す:
//
//   疑似マイク → MediaRecorder → decodeAudioData → 16 kHz リサンプル
//   → ONNX Runtime(jsDelivr の固定版)→ Whisper(Hugging Face の重み)
//   → アライメント → 計量
//
// 音声は Windows の日本語 TTS で作った WAV を Chromium の
// `--use-file-for-fake-audio-capture` に食わせる。
//
// ■ この検品が言えないこと
//
// **TTS は人の音読の代わりにならない。** 合成音声は明瞭で間も一定なので、
// ここで出る CER は人が読んだときの CER ではない。さらに SAPI が漢字を
// 読み違えれば、Whisper が忠実に写しても誤りとして数えられる
// (TTS の読み誤りと ASR の誤りが混ざる)。
//
// したがってここで確かめるのは**経路が通ること**であって、精度ではない。
// 精度の判定は人が読み上げて行う。
//
//   node scripts/browser_check.mjs [--headed]
// =====================================================================
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const OUT = "out";
const WAV = ".loop/audio/p001.wav";
const PORT = 4173;
const headed = process.argv.includes("--headed");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

if (!existsSync(OUT)) {
  console.log("out/ が無い。先に npm run build");
  process.exit(1);
}
if (!existsSync(WAV)) {
  console.log(`${WAV} が無い。先に scripts/make_speech.ps1`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  let path = join(OUT, normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, ""));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  createReadStream(path).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));
const origin = `http://localhost:${PORT}`;

/** WAV の頭から再生長を読む(16 bit PCM 前提) */
function wavDurationSec(path) {
  const buf = readFileSync(path);
  const rate = buf.readUInt32LE(24);
  const byteRate = buf.readUInt32LE(28);
  if (rate === 0 || byteRate === 0) throw new Error(`WAV の頭が読めない: ${path}`);
  return (buf.length - 44) / byteRate;
}
const wavSeconds = wavDurationSec(WAV);
console.log(`  音声 ${wavSeconds.toFixed(1)} 秒(日本語 TTS。人の音読ではない)`);

const problems = [];
const consoleErrors = [];
const requests = [];
const failures = [];
const finished = [];

const browser = await chromium.launch({
  headless: !headed,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${process.cwd()}/${WAV}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({ permissions: ["microphone"] });
const page = await context.newPage();

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
  if (process.env.VERBOSE === "1") {
    console.log(`    [${m.type()}] ${m.text().slice(0, 220)}`);
  }
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("request", (r) => requests.push(r.url()));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
page.on("requestfinished", (r) => finished.push(r.url()));
page.on("requestfailed", (r) =>
  failures.push(`failed ${r.failure()?.errorText ?? "?"} ${r.url()}`),
);

function check(name, ok, detail = "") {
  console.log(`  [${ok ? "pass" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(name);
}

try {
  await page.goto(origin, { waitUntil: "networkidle" });

  // ---- 1. 画面が出ているか
  await page.waitForSelector("h1");
  check("題が出る", (await page.textContent("h1")) === "音写ラボ");
  const passageText = (await page.textContent(".passage")) ?? "";
  check("課題文が出る", passageText.includes("このあいびきは先年"));
  const options = await page.locator('select[aria-label="課題文"] option').count();
  check("課題文が全件えらべる", options === 24, `${options} 件`);
  check("フッタが出る", (await page.locator("footer a").count()) === 3);

  // ---- 2. 押す前に量と実行系を言っているか
  const listener = (await page.textContent(".listener")) ?? "";
  check("落とす量を先に言う", /\d+ MB/.test(listener), listener.match(/\d+ MB/)?.[0]);
  check("実行系を先に言う", /WebGPU|WebAssembly/.test(listener));

  // ---- 3. 軽い方の模型で読み込む
  // 既定は軽い方で通す。既定の模型を確かめたいときは MODEL_LABEL で切り替える
  await page.selectOption('select[aria-label="使う模型"]', {
    label: process.env.MODEL_LABEL ?? "whisper-tiny(軽い・粗い)",
  });
  const t0 = Date.now();
  await page.click('button:has-text("模型を読み込む")');
  // 進み具合を定期的に覗く。止まったときに「何を待っているか」が分かる
  const limit = Number(process.env.LOAD_TIMEOUT_MS ?? 600_000);
  const ticker = setInterval(async () => {
    const text = await page.textContent(".listener").catch(() => null);
    const seen = requests.filter((u) => u.includes("cdn.jsdelivr.net")).length;
    console.log(
      `    …${((Date.now() - t0) / 1000).toFixed(0)}s 要求 ${requests.length}(jsDelivr ${seen}) 完了 ${
        finished.length
      } | ${(text ?? "").replace(/\s+/g, " ").slice(-90)}`,
    );
  }, 15_000);
  try {
    // 成功と失敗の**両方**を待つ。片方だけ待つと、失敗が時間切れの顔をして現れる
    await page.waitForSelector('button:has-text("音読をはじめる"), .error', {
      timeout: limit,
      state: "visible",
    });
    const err = await page.locator(".error").first().textContent().catch(() => null);
    if (err !== null) {
      console.log(`  読み込みが失敗した: ${err}`);
      throw new Error(`模型の読み込みに失敗: ${err}`);
    }
  } finally {
    clearInterval(ticker);
  }
  const loadSec = (Date.now() - t0) / 1000;
  console.log(`  模型の読み込み ${loadSec.toFixed(1)} 秒`);

  // ---- 4. どこから何を取ったか(N-03 / N-08 / G-13)
  const hf = requests.filter((u) => u.includes("huggingface.co"));
  const cdn = requests.filter((u) => u.includes("cdn.jsdelivr.net"));
  const ownWasm = requests.filter((u) => u.startsWith(origin) && u.endsWith(".wasm"));
  check("重みを Hugging Face から取った", hf.length > 0, `${hf.length} 件`);
  check("実行系を jsDelivr から取った", cdn.length > 0, `${cdn.length} 件`);
  check(
    "実行系の版を固定して取った",
    cdn.some((u) => u.includes("onnxruntime-web@1.26.0-dev.20260416-b7804b056c")),
  );
  check("自オリジンへ .wasm を取りに行かない", ownWasm.length === 0, ownWasm.join(" "));
  check("404 が無い", failures.length === 0, failures.slice(0, 3).join(" / "));

  // ---- 5. 疑似マイクで全経路を通す
  await page.click('button:has-text("音読をはじめる")');
  await page.waitForSelector("button.recording");
  // Chromium は WAV を繰り返し流す。二周目に入る前に、しかし末尾を
  // 切り落とさないところで止める。長さは WAV の頭から読む —
  // 決め打ちの秒数だと、音声を差し替えた日に末尾が黙って欠ける
  await page.waitForTimeout(Math.round((wavSeconds - 0.3) * 1000));
  await page.click("button.recording");
  await page.waitForSelector('button:has-text("音読をはじめる")', { timeout: 600_000 });

  const transcript = await page.inputValue('textarea[aria-label="転写"]');
  console.log(`  転写: ${transcript}`);
  check("認識結果が空でない", transcript.trim().length > 0);
  check(
    "日本語が返っている",
    /[぀-ヿ一-鿿]/.test(transcript),
    `${transcript.length} 字`,
  );

  // ---- 6. 計量まで届いているか
  const numbers = (await page.textContent(".numbers")) ?? "";
  check("厳密 CER が出る", numbers.includes("厳密 CER"));
  check("読速が出る(音声から来た証拠)", numbers.includes("読速"));
  const marks = await page.locator(".passage mark").count();
  check("原文の上に印が描かれる", marks > 0, `${marks} 箇所`);
  const cer = numbers.match(/(\d+\.\d)%/);
  console.log(`  厳密 CER ${cer?.[1] ?? "?"}%(TTS 音声。人の音読の値ではない)`);

  check("console エラーが無い", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" / "));

  await page.screenshot({ path: ".loop/browser_check.png", fullPage: true });
  // 画面ぶんも撮る。fixed のフッタは fullPage だと本文の途中に写り込むので、
  // 「フッタが本文を隠していないか」は viewport の絵でしか見られない
  await page.screenshot({ path: ".loop/browser_viewport.png" });
} catch (e) {
  const head = String(e.message).split(String.fromCharCode(10))[0];
  problems.push(`例外: ${head}`);
  console.log(`  [FAIL] 例外 — ${head}`);
  console.log("  --- 診断 ---");
  console.log(`  console エラー ${consoleErrors.length} 件:`);
  for (const c of consoleErrors.slice(0, 8)) console.log(`    ${c.slice(0, 300)}`);
  console.log(`  4xx/5xx ${failures.length} 件:`);
  for (const f of failures.slice(0, 8)) console.log(`    ${f}`);
  const outbound = requests.filter((u) => !u.startsWith(origin));
  console.log(`  外部への要求 ${outbound.length} 件:`);
  for (const u of outbound.slice(0, 12)) console.log(`    ${u}`);
  const own = requests.filter((u) => u.startsWith(origin));
  console.log(`  自オリジンへの要求 ${own.length} 件:`);
  for (const u of own.slice(0, 12)) console.log(`    ${u.replace(origin, "")}`);
  await page.screenshot({ path: ".loop/browser_check.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.log(`browser: FAIL — ${problems.length} 件`);
  process.exit(1);
}
console.log("browser: PASS");
