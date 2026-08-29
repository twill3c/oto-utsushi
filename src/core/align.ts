// =====================================================================
// F-03 アライメント — 参照と転写を文字単位で整列する
//
// 挿入・削除・置換をそれぞれコスト 1 とする Levenshtein 距離を解き、
// 最小コストの操作列を復元して**原文の位置へ逆写像**する。
//
// ■ 同点の割り方(仕様。二実装照合が成立するための前提)
//
// 最小コストの操作列は一意ではない。ref="ab" hyp="ba" は
// 「2 回の置換」でも「1 挿入 + 1 削除」でもコスト 2 になる。
// 操作内訳を二実装で突き合わせる(G-01)ためには、同点をどう割るかを
// **仕様として固定**しなければならない。優先順位はこの順:
//
//   1. 斜め(equal / sub)
//   2. 削除(参照側の文字が転写に現れない)
//   3. 挿入(転写側の文字が参照に無い)
//
// Python 側の独立実装(tools/align_ref.py)も同じ順位に従う。
// 距離そのものは実装に依らないが、内訳はこの規約に依る。
//
// ■ 実装戦略を Python 側とわざと変えている
//
// コストは 2 行のローリングだけで持ち、復元用に方向表を別に持つ。
// Python 側は素朴な全表 DP + 再走査で戻る。同じ疑似コードを二言語へ
// 写しただけでは照合にならない(TEST_SPEC「オラクルの出所」)。
// =====================================================================
import type { Alignment, EditOp, Normalized } from "./types";

const DIAG = 1;
const DEL = 2;
const INS = 3;

/**
 * 参照と転写を整列する。
 *
 * @param refText 正規化済みの参照テキスト
 * @param hypText 正規化済みの転写テキスト
 * @param refOrigIndex 参照のコードポイント index → 原文 index の写像
 *   (`normalize()` の `origIndex`)。省略時は原文位置を null にする
 */
export function align(
  refText: string,
  hypText: string,
  refOrigIndex?: readonly number[],
): Alignment {
  const ref = Array.from(refText);
  const hyp = Array.from(hypText);
  const n = ref.length;
  const m = hyp.length;

  // 方向表(復元用)。コストは 2 行だけ持つ
  const from = new Uint8Array((n + 1) * (m + 1));
  let prev = new Int32Array(m + 1);
  let curr = new Int32Array(m + 1);

  for (let j = 1; j <= m; j += 1) {
    prev[j] = j;
    from[j] = INS;
  }
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    from[i * (m + 1)] = DEL;
    for (let j = 1; j <= m; j += 1) {
      const diag = prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      // 同点は 斜め > 削除 > 挿入 の順で割る(上の仕様)
      let best = diag;
      let dir = DIAG;
      if (del < best) {
        best = del;
        dir = DEL;
      }
      if (ins < best) {
        best = ins;
        dir = INS;
      }
      curr[j] = best;
      from[i * (m + 1) + j] = dir;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  // 交換後の prev が最終行。n = 0 のときは初期化した 0 行がそのまま残る
  const distance = prev[m];

  // 復元(終点から始点へ辿り、最後に反転する)
  const ops: EditOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    // 0 行 / 0 列も方向表に入れてあるので、そのまま引ける
    const dir = from[i * (m + 1) + j];
    if (dir === DIAG) {
      const same = ref[i - 1] === hyp[j - 1];
      ops.push({
        kind: same ? "equal" : "sub",
        refIndex: i - 1,
        hypIndex: j - 1,
        refAnchor: i - 1,
        origIndex: refOrigIndex ? (refOrigIndex[i - 1] ?? null) : null,
        refChar: ref[i - 1],
        hypChar: hyp[j - 1],
      });
      i -= 1;
      j -= 1;
    } else if (dir === DEL) {
      ops.push({
        kind: "delete",
        refIndex: i - 1,
        hypIndex: null,
        refAnchor: i - 1,
        origIndex: refOrigIndex ? (refOrigIndex[i - 1] ?? null) : null,
        refChar: ref[i - 1],
        hypChar: null,
      });
      i -= 1;
    } else {
      ops.push({
        kind: "insert",
        refIndex: null,
        hypIndex: j - 1,
        refAnchor: i,
        origIndex: null,
        refChar: null,
        hypChar: hyp[j - 1],
      });
      j -= 1;
    }
  }
  ops.reverse();

  return { distance, ops, refLength: n, hypLength: m };
}

/** `normalize()` の結果をそのまま渡すための薄い包み */
export function alignNormalized(ref: Normalized, hyp: Normalized): Alignment {
  return align(ref.text, hyp.text, ref.origIndex);
}

/** 操作の内訳を数える */
export function countOps(ops: readonly EditOp[]): {
  equal: number;
  sub: number;
  insert: number;
  delete: number;
} {
  const c = { equal: 0, sub: 0, insert: 0, delete: 0 };
  for (const op of ops) c[op.kind] += 1;
  return c;
}

/**
 * 操作列を参照へ適用して転写を復元する(T-013 の整合検査)。
 *
 * 操作列が距離と辻褄が合っているかを、外側から確かめるための道具。
 */
export function applyOps(refText: string, ops: readonly EditOp[]): string {
  const ref = Array.from(refText);
  let out = "";
  for (const op of ops) {
    // delete は転写に何も残さない。それ以外は転写側の文字を出す
    if (op.kind === "delete") continue;
    out += op.hypChar ?? "";
  }
  // 参照側を読み切っているか(操作列が参照を過不足なく覆っているか)
  const consumed = ops.filter((op) => op.kind !== "insert").length;
  if (consumed !== ref.length) {
    throw new Error(
      `操作列が参照を覆っていない: consumed=${consumed} refLength=${ref.length}`,
    );
  }
  return out;
}
