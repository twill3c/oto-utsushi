// G-11 / G-12 — モデルレジストリと実行系の選択
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  type Device,
  MODELS,
  REJECTED,
  dtypeFor,
  formatBytes,
  getModel,
  threadingState,
} from "../models";

const DEVICES: Device[] = ["webgpu", "wasm"];

describe("モデルレジストリ", () => {
  it("G-11 各エントリが id・ラベル・理由・実測サイズを持つ", () => {
    expect(MODELS.length).toBeGreaterThan(0);
    for (const m of MODELS) {
      expect(m.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.note.length).toBeGreaterThan(0);
      for (const d of DEVICES) {
        // 実測値であることの最低限の検算: 桁が現実的な範囲にある
        expect(m.bytes[d]).toBeGreaterThan(10_000_000);
        expect(m.bytes[d]).toBeLessThan(400_000_000);
      }
    }
  });

  it("G-11 既定のモデルが実在し、id が重複しない", () => {
    expect(getModel(DEFAULT_MODEL_ID)).toBeDefined();
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(getModel("存在しない/模型")).toBeUndefined();
  });

  it("G-11 WASM 側は必ず WebGPU 側より軽い(量子化を効かせている)", () => {
    for (const m of MODELS) {
      expect(m.bytes.wasm).toBeLessThan(m.bytes.webgpu);
    }
  });

  it("G-11 捨てたモデルを理由つきで残している", () => {
    // 「調べたが駄目だった」と「調べていない」を取り違えないための記録
    expect(REJECTED.length).toBeGreaterThan(0);
    for (const r of REJECTED) {
      expect(r.why).toContain("実測");
      expect(r.bytes).toBeGreaterThan(0);
      // 採用したどのモデルよりも重いから捨てた、という筋が通っていること
      for (const m of MODELS) expect(r.bytes).toBeGreaterThan(m.bytes.webgpu);
      // 捨てたものを採用一覧に置き忘れていない
      expect(MODELS.some((m) => m.id === r.id)).toBe(false);
    }
  });

  it("G-12 実行系ごとの重みの型が決定論的", () => {
    // WebGPU でもエンコーダは fp32 のまま。fp16 には既知の精度問題があり、
    // 速さのために測定対象を歪めない(transformers.js #1590)
    expect(dtypeFor("webgpu")).toEqual({
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    });
    expect(dtypeFor("wasm")).toEqual({
      encoder_model: "q8",
      decoder_model_merged: "q8",
    });
    for (const d of DEVICES) {
      expect(JSON.stringify(dtypeFor(d))).toBe(JSON.stringify(dtypeFor(d)));
    }
  });

  it("単スレッドへ退避していることを黙らせない", () => {
    // onnxruntime-web は crossOriginIsolated でないと黙って単スレッドに落ち、
    // 3〜4 倍遅くなる。黙られると「こんなものか」で終わる
    expect(threadingState(false, "wasm")).toContain("単スレッド");
    expect(threadingState(true, "wasm")).not.toContain("単スレッド");
    // WebGPU では isolated の値に関わらず同じ表示になる
    expect(threadingState(false, "webgpu")).toBe(threadingState(true, "webgpu"));
  });

  it("サイズを人が読める形にする", () => {
    expect(formatBytes(76_894_629)).toBe("73 MB");
    expect(formatBytes(0)).toBe("0 MB");
  });
});
