// T-010〜T-014 / G-01 — アライメント
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { align, alignNormalized, applyOps, countOps } from "../align";
import { normalize } from "../normalize";

/**
 * G-01 の照合ケース。Python の独立実装(tools/align_ref.py)が生成したもの。
 * 再生成は `python tools/gen_cases.py`。
 */
interface CaseFile {
  implementation: string;
  tie_break: string;
  cases: Array<{
    ref: string;
    hyp: string;
    distance: number;
    counts: { equal: number; sub: number; insert: number; delete: number };
  }>;
}

const casesPath = fileURLToPath(
  new URL("../../../data/cases/align_cases.json", import.meta.url),
);
const caseFile = JSON.parse(readFileSync(casesPath, "utf8")) as CaseFile;

describe("align", () => {
  it("T-010 完全一致では距離 0 ですべて equal", () => {
    const r = align("あいうえお", "あいうえお");
    expect(r.distance).toBe(0);
    expect(countOps(r.ops)).toEqual({
      equal: 5,
      sub: 0,
      insert: 0,
      delete: 0,
    });
  });

  it("T-011 片方が空なら距離はもう片方の長さ", () => {
    const a = align("あいう", "");
    expect(a.distance).toBe(3);
    expect(countOps(a.ops)).toEqual({
      equal: 0,
      sub: 0,
      insert: 0,
      delete: 3,
    });

    const b = align("", "あいう");
    expect(b.distance).toBe(3);
    expect(countOps(b.ops)).toEqual({
      equal: 0,
      sub: 0,
      insert: 3,
      delete: 0,
    });

    const c = align("", "");
    expect(c.distance).toBe(0);
    expect(c.ops).toEqual([]);
  });

  it("T-012 / G-01 Python の独立実装と距離・操作内訳が完全一致", () => {
    // 期待値の出所: tools/align_ref.py(全表 DP + 逆走査)。
    // TS 側は 2 行ローリング + 方向表。実装戦略を変えてあるので、
    // 一致は「同じ写し間違い」ではなく実質的な照合になる
    expect(caseFile.cases.length).toBeGreaterThanOrEqual(1000);
    let mismatches = 0;
    for (const c of caseFile.cases) {
      const r = align(c.ref, c.hyp);
      if (r.distance !== c.distance) mismatches += 1;
      else if (JSON.stringify(countOps(r.ops)) !== JSON.stringify(c.counts)) {
        mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("T-013 操作列を参照へ適用すると転写が復元される", () => {
    for (const c of caseFile.cases.slice(0, 200)) {
      const r = align(c.ref, c.hyp);
      expect(applyOps(c.ref, r.ops)).toBe(c.hyp);
      // 操作列のコストが距離と辻褄が合う
      const n = countOps(r.ops);
      expect(n.sub + n.insert + n.delete).toBe(r.distance);
    }
  });

  it("T-013b 参照を覆っていない操作列は applyOps が落ちる", () => {
    const r = align("あいう", "あいう");
    expect(() => applyOps("あいうえお", r.ops)).toThrow(/覆っていない/);
  });

  it("T-014 原文位置への逆写像が有効で、equal の位置は原文と一致する", () => {
    const src = "「あ、い」うえお。";
    const ref = normalize(src);
    const hyp = normalize("あいうえお");
    const r = alignNormalized(ref, hyp);
    expect(r.distance).toBe(0);
    for (const op of r.ops) {
      expect(op.origIndex).not.toBeNull();
      const at = op.origIndex as number;
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(src.length);
      expect(src[at]).toBe(op.refChar);
    }
  });

  it("T-014b insert は原文位置を持たず、錨だけを持つ", () => {
    const ref = normalize("あいう");
    const hyp = normalize("あXいう");
    const r = alignNormalized(ref, hyp);
    const ins = r.ops.filter((op) => op.kind === "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].origIndex).toBeNull();
    expect(ins[0].refAnchor).toBe(1);
    expect(ins[0].hypChar).toBe("x");
  });

  it("同点は 斜め > 削除 > 挿入 の順に割る(SPEC F-03)", () => {
    // ref=ab hyp=ba はコスト 2 の解が複数ある。斜めを優先するので置換 2 回
    expect(countOps(align("ab", "ba").ops)).toEqual({
      equal: 0,
      sub: 2,
      insert: 0,
      delete: 0,
    });
  });
});
