#!/usr/bin/env node
// =====================================================================
// dtype の実測 — どの重みの型が実際に動くかをブラウザで確かめる
//
// loop_003 で、q8(*_quantized)が ONNX Runtime 1.26.0-dev の QDQ 最適化で
// 落ちることが分かった(TransposeDQWeightsForMatMulNBits / Missing required scale)。
// **どの型なら通るかは、その版のブラウザで試すまで分からない。**
//
// 製品のコードには触らず、jsDelivr の同じ版を直接読む素の頁で試す。
// アプリを作り替えながら試すと、失敗が誰のものか分からなくなる。
//
//   node scripts/probe_dtype.mjs [model-id]
// =====================================================================
import { createServer } from "node:http";
import { chromium } from "playwright";

const MODEL = process.argv[2] ?? "onnx-community/whisper-tiny";
const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const PORT = 4174;

const CANDIDATES = [
  // loop_003 実測: decoder_model_merged の q8 だけが ONNX Runtime 1.26.0-dev の
  // QDQ 最適化(TransposeDQWeightsForMatMulNBits)で落ちる。encoder の q8 は通る。
  // 小さい順に、どこまで軽くできるかを探る
  { encoder_model: "q8", decoder_model_merged: "int8" },
  { encoder_model: "q8", decoder_model_merged: "uint8" },
  { encoder_model: "q8", decoder_model_merged: "fp16" },
  { encoder_model: "q8", decoder_model_merged: "bnb4" },
  { encoder_model: "q8", decoder_model_merged: "q4" },
];

const html = `<!doctype html><meta charset="utf-8"><title>dtype probe</title>
<body><pre id="log"></pre><script type="module">
import { pipeline, env } from "${LIB}";
env.allowLocalModels = false;
const log = (s) => { document.getElementById("log").textContent += s + "\\n"; };
window.__results = [];
window.__try = async (dtype) => {
  const started = performance.now();
  try {
    await pipeline("automatic-speech-recognition", ${JSON.stringify(MODEL)}, {
      device: "wasm",
      dtype,
    });
    const r = { dtype, ok: true, sec: (performance.now() - started) / 1000 };
    window.__results.push(r);
    log("OK   " + JSON.stringify(dtype) + "  " + r.sec.toFixed(1) + "s");
    return r;
  } catch (e) {
    const r = { dtype, ok: false, error: String(e.message ?? e).slice(0, 200) };
    window.__results.push(r);
    log("FAIL " + JSON.stringify(dtype) + "  " + r.error);
    return r;
  }
};
window.__ready = true;
</script></body>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ headless: true });

console.log(`模型: ${MODEL}(実行系 wasm)`);
for (const dtype of CANDIDATES) {
  // 候補ごとに文脈を作り直す。一度落ちた ONNX Runtime の状態が残ると、
  // 二件目以降が「同じ理由で落ちた」ように見えてしまう
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction("window.__ready === true", null, { timeout: 120_000 });
  const r = await page.evaluate((d) => window.__try(d), dtype);
  console.log(
    `  [${r.ok ? "OK  " : "FAIL"}] ${JSON.stringify(dtype)}` +
      (r.ok ? `  ${r.sec.toFixed(1)}s` : `  ${r.error}`),
  );
  await context.close();
}

await browser.close();
server.close();
