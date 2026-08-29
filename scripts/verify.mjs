#!/usr/bin/env node
// =====================================================================
// 品質ゲート + ループ観測ログ
//
// すべての変更はこのスクリプトの green を完了条件とする(AGENTS.md §3)。
// 実行結果は .loop/verify.jsonl に追記され、各ステップの詳細ログは
// .loop/<step>.log に残る。エージェントは fail 時にまず該当ログを読むこと。
// パイプ・ページャを通さず素で実行し、exit code で判定する。
//
// 使い方:
//   node scripts/verify.mjs          … フルゲート(build 込み)
//   node scripts/verify.mjs --fast   … next build をスキップ(高速ループ用)
// =====================================================================
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const fast =
  process.argv.includes("--fast") || process.env.VERIFY_SKIP_BUILD === "1";

mkdirSync(".loop", { recursive: true });

function capture(command) {
  const r = spawnSync(command, { shell: true, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const sha = capture("git rev-parse --short HEAD") ?? "no-git";
const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const result = {};
let pass = true;

function runStep(name, command) {
  const start = Date.now();
  const r = spawnSync(command, { shell: true, encoding: "utf8" });
  writeFileSync(`.loop/${name}.log`, `${r.stdout ?? ""}${r.stderr ?? ""}`);
  result[name] = r.status === 0 ? "pass" : "fail";
  if (r.status !== 0) pass = false;
  const dur = Math.round((Date.now() - start) / 1000);
  console.log(`  [${result[name]}] ${name} (${dur}s)`);
}

console.log(`verify @ ${sha} ${ts}`);
runStep("typecheck", "npx tsc --noEmit");
runStep("lint", "npm run -s lint");
runStep("test", "npx vitest run --coverage");

if (!fast) {
  runStep("build", "npm run -s build");
  // 成果物はソースではなく現物を見る(N-08 / HC-052)。
  // build のあとでなければ意味がないので、ここに置く
  runStep("bundle", "node scripts/check_bundle.mjs");
} else {
  result.build = "skipped";
  result.bundle = "skipped";
  console.log("  [skipped] build (--fast)");
}

appendFileSync(
  ".loop/verify.jsonl",
  JSON.stringify({
    ts,
    sha,
    typecheck: result.typecheck,
    lint: result.lint,
    test: result.test,
    build: result.build,
    bundle: result.bundle,
    pass,
  }) + "\n",
);

if (pass) {
  console.log("verify: PASS");
  process.exit(0);
} else {
  console.log("verify: FAIL — 詳細は .loop/<step>.log を確認");
  process.exit(1);
}
