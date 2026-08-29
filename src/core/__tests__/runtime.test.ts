// G-13 — 実行系の取得先を、こちらで決めているか
import { describe, expect, it } from "vitest";
import { ORT_VERSION, isSafariUA, wasmPaths } from "../runtime";

describe("実行系の取得先", () => {
  it("G-13 版が範囲指定でなく固定されている", () => {
    // 権威はライブラリではなく**その版の挙動**である(HC-050)。
    // ^ や ~ が混ざったら、上げた日にオラクルが黙って動く
    expect(ORT_VERSION).not.toMatch(/[\^~*x]/);
    expect(ORT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("G-13 mjs と wasm を両方指定する", () => {
    // 片方だけ指定すると、残りがライブラリ既定のブラウザ分岐へ落ちる
    for (const safari of [true, false]) {
      const p = wasmPaths(safari);
      expect(p.mjs).toContain(ORT_VERSION);
      expect(p.wasm).toContain(ORT_VERSION);
      expect(p.mjs.endsWith(".mjs")).toBe(true);
      expect(p.wasm.endsWith(".wasm")).toBe(true);
      // 同じ実行系の .mjs と .wasm が対になっている
      expect(p.mjs.slice(0, -4)).toBe(p.wasm.slice(0, -5));
    }
  });

  it("G-13 Safari とそれ以外で違う実行系を割り当てる(ライブラリと同じ組)", () => {
    expect(wasmPaths(true).wasm).toContain("ort-wasm-simd-threaded.wasm");
    expect(wasmPaths(false).wasm).toContain(
      "ort-wasm-simd-threaded.asyncify.wasm",
    );
  });

  it("Safari 判定は Chrome / Edge を巻き込まない", () => {
    // Chromium 系の UA も "Safari" を名乗る
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    const edge = `${chrome} Edg/140.0.0.0`;
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const firefox =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(isSafariUA(chrome)).toBe(false);
    expect(isSafariUA(edge)).toBe(false);
    expect(isSafariUA(safari)).toBe(true);
    expect(isSafariUA(firefox)).toBe(false);
    expect(isSafariUA("")).toBe(false);
  });

  it("取得先は自オリジンでない(N-08: 大きな binary を Vercel に置かない)", () => {
    for (const safari of [true, false]) {
      const p = wasmPaths(safari);
      expect(p.wasm.startsWith("https://cdn.jsdelivr.net/")).toBe(true);
      expect(p.mjs.startsWith("https://cdn.jsdelivr.net/")).toBe(true);
    }
  });
});
