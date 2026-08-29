// T-050〜T-054 / G-03 — 構成のゲート
//
// ここは「コードが正しいか」ではなく「コストゼロと循環の禁止という前提が
// まだ立っているか」を見る検査。実装より先に壊れるのはたいてい前提の方である。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_INPUT_KEYS,
  assertNoReferenceLeak,
  type RecognitionInput,
} from "../recognizer";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(rel: string): string {
  return readFileSync(root + rel, "utf8");
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("構成ゲート", () => {
  it("T-050 / N-03 モデル重みをリポジトリに置かない", () => {
    // 数十 MB の ONNX を public/ に置くと Vercel の無料枠を帯域で焼く。
    // 重みは Hugging Face の CDN から取る(SPEC N-03)
    const weights = /\.(onnx|bin|safetensors|gguf)$/i;
    for (const dir of ["public", "out"]) {
      const found = walk(root + dir).filter((f) => weights.test(f));
      expect(found).toEqual([]);
    }
  });

  it("T-051 / N-04 core に送信呼び出しが無い", () => {
    // 音声も認識結果もネットワークへ出さない。モデル取得だけが例外で、
    // それは loop_002 で専用モジュールへ隔離する
    const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\b/;
    const files = walk(root + "src/core").filter(
      (f) => f.endsWith(".ts") && !f.includes("__tests__"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(forbidden.test(readFileSync(f, "utf8"))).toBe(false);
    }
  });

  it("T-052 / G-03 認識器の入力に参照テキストの欄が無い(型)", () => {
    const src = read("src/core/recognizer.ts");
    const inputBlock = src.slice(
      src.indexOf("interface RecognitionInput"),
      src.indexOf("interface RecognitionResult"),
    );
    for (const banned of [
      "prompt",
      "initialPrompt",
      "initial_prompt",
      "reference",
      "passage",
      "hotwords",
      "vocabulary",
      "hint",
    ]) {
      expect(inputBlock.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    expect(ALLOWED_INPUT_KEYS).toEqual(["audio", "sampleRate", "language"]);
  });

  it("T-052b / G-03 実行時にも欄の増加を止める", () => {
    const ok: RecognitionInput = {
      audio: new Float32Array(16),
      sampleRate: 16000,
      language: "ja",
    };
    expect(() => assertNoReferenceLeak(ok)).not.toThrow();

    // 将来 prompt を生やしたら、認識を実行せずにここで落ちる
    const leaked = { ...ok, prompt: "禅智内供の鼻と云えば" };
    expect(() => assertNoReferenceLeak(leaked as RecognitionInput)).toThrow(
      /循環の禁止/,
    );

    const wrongRate = { ...ok, sampleRate: 44100 };
    expect(() => assertNoReferenceLeak(wrongRate)).toThrow(/16 kHz/);
  });

  it("T-053 / N-01 静的エクスポートで、サーバ経路を持たない", () => {
    expect(read("next.config.ts")).toContain('output: "export"');
    expect(existsSync(root + "src/app/api")).toBe(false);
    expect(existsSync(root + "app/api")).toBe(false);
    expect(existsSync(root + "vercel.json")).toBe(false);
  });

  it("T-054 / N-05 ランタイム依存が許可リストに収まる", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    const allowed = new Set([
      "next",
      "react",
      "react-dom",
      "@huggingface/transformers",
    ]);
    for (const name of Object.keys(pkg.dependencies)) {
      expect(allowed.has(name)).toBe(true);
    }
  });

  it("G-10 core が Date.now / Math.random を呼ばない", () => {
    const files = walk(root + "src/core").filter(
      (f) => f.endsWith(".ts") && !f.includes("__tests__"),
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("Date.now");
      expect(src).not.toContain("Math.random");
    }
  });
});
