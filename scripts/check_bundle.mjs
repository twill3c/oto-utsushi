#!/usr/bin/env node
// =====================================================================
// N-08 成果物の検査 — ソースではなく現物を見る
//
// バンドラは「評価する場所」と「載せる場所」を自分で決める。
// loop_002 では webpack が ONNX Runtime の wasm 23.6 MB を
// out/_next/static/media へ複製し、成果物の 94% を占めていた。
// **ソースを読んでも分からず、閲覧しても気づけない**(取りに行くのは
// wasmPaths の側だけなので転送量にも現れない)。
//
// そこで対で検査する(HC-052):
//   (1) 想定外の大きな資産が載っていない
//   (2) その裏返しとして、意図した取得先を確かに名指ししている
//
// (2) が無いと「何も読み込まない」壊れ方が (1) の緑をすり抜ける。
// =====================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";

const OUT = "out";

/** 1 ファイルの上限。これを超える資産は必ず理由とともに列挙する */
const LARGE_FILE_LIMIT = 1024 * 1024;

/**
 * 成果物全体の上限。
 *
 * 実測 2026-08-29: wasm を落としたあとで 1.48 MB。
 * 3 MB は「気づかないうちに実行系や重みが混ざった」を捕まえるための線であって、
 * 節約目標ではない。超えたら中身を数えてからこの値を動かす。
 */
const TOTAL_LIMIT = 3 * 1024 * 1024;

/** 載っていてよい大きな資産(いまは無い)。足すときは理由を書く */
const ALLOWED_LARGE = new Set();

/** 成果物のどこかで必ず名指しされていなければならない取得先 */
const REQUIRED_REFERENCES = [
  // 実行系は CDN から取る(N-08)。自オリジンには置かない
  "cdn.jsdelivr.net/npm/onnxruntime-web@",
  // 重みは Hugging Face から取る(N-03)
  "huggingface.co",
  // 既定のモデル
  "onnx-community/whisper-base",
];

/** 成果物に現れてはならないもの */
const FORBIDDEN_PATTERNS = [
  { re: /\.onnx$/i, why: "モデル重みは Vercel に置かない(N-03)" },
  { re: /\.safetensors$/i, why: "モデル重みは Vercel に置かない(N-03)" },
  { re: /\.wasm$/i, why: "実行系は CDN から取る(N-08)" },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const problems = [];
const files = walk(OUT);
let total = 0;

for (const f of files) {
  const size = statSync(f).size;
  total += size;
  for (const { re, why } of FORBIDDEN_PATTERNS) {
    if (re.test(f)) problems.push(`載ってはならない資産: ${f}(${why})`);
  }
  if (size > LARGE_FILE_LIMIT && !ALLOWED_LARGE.has(f)) {
    problems.push(
      `理由の無い大きな資産: ${f}(${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  }
}

if (total > TOTAL_LIMIT) {
  problems.push(
    `成果物が上限を超えた: ${(total / 1024 / 1024).toFixed(2)} MB > ${(
      TOTAL_LIMIT /
      1024 /
      1024
    ).toFixed(2)} MB`,
  );
}

// (2) 意図した取得先を名指ししているか — これが無いと「何も読まない」で緑になる
const haystack = files
  .filter((f) => /\.(js|mjs|html|txt)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
for (const needle of REQUIRED_REFERENCES) {
  if (!haystack.includes(needle)) {
    problems.push(`成果物が名指ししていない: ${needle}`);
  }
}

console.log(
  `bundle: ${files.length} ファイル / ${(total / 1024 / 1024).toFixed(2)} MB`,
);
if (problems.length > 0) {
  for (const p of problems) console.log(`  NG ${p}`);
  process.exit(1);
}
console.log("bundle: OK");
