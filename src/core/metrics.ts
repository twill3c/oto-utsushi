// =====================================================================
// F-04 計量 — 認識の誤りを原文の上に置き直す
//
// 指標は二本立てにする(SPEC §4「表記ゆれをどう扱うか」):
//   - 厳密 CER      … 正規化後の字面で測る。下限として動かさない
//   - 表記ゆれ許容 CER … 読みを保つ変換(variants.ts)を**両側に等しく**掛けて測る
//
// 片側だけに変換を掛けると、それは採点ではなく答案の書き換えになる。
// =====================================================================
import { align, countOps } from "./align";
import { normalize } from "./normalize";
import { canonicalize } from "./variants";
import type { EditOp, Measurement, Normalized, Restart, Skip } from "./types";

export interface MeasureOptions {
  /** これ以上続いた削除を「読み飛ばし」として 1 件に数える(既定 5) */
  minSkipRun?: number;
  /** これ以上続いた挿入を「言い直し」の候補とする(既定 2) */
  minRestartRun?: number;
  /** 発話の継続時間(秒)。読速の分母 */
  durationSec?: number | null;
}

const DEFAULT_MIN_SKIP_RUN = 5;
const DEFAULT_MIN_RESTART_RUN = 2;

/** 言い直しと認めるずれの上限(挿入長に対する割合) */
const RESTART_TOLERANCE = 3;

function ratio(distance: number, refLength: number): number | null {
  if (refLength === 0) return null;
  return distance / refLength;
}

/**
 * 読み飛ばし = 連続する削除。
 *
 * 原文上の範囲は、削除された参照文字の原文位置から、
 * **その次の参照文字の原文位置まで**とする。こうすると削除区間に挟まれた
 * 句読点(正規化で落ちている)も範囲に入り、UI の網掛けが原文と一致する。
 */
function findSkips(
  ops: readonly EditOp[],
  ref: Normalized,
  passageText: string,
  minRun: number,
): Skip[] {
  const skips: Skip[] = [];
  let run: EditOp[] = [];

  const flush = () => {
    if (run.length >= minRun) {
      const firstRefIndex = run[0].refIndex as number;
      const lastRefIndex = run[run.length - 1].refIndex as number;
      const origStart = ref.origIndex[firstRefIndex];
      const nextRefIndex = lastRefIndex + 1;
      const origEnd =
        nextRefIndex < ref.origIndex.length
          ? ref.origIndex[nextRefIndex]
          : passageText.length;
      skips.push({
        origStart,
        origEnd,
        length: run.length,
        text: passageText.slice(origStart, origEnd),
      });
    }
    run = [];
  };

  for (const op of ops) {
    if (op.kind === "delete") {
      run.push(op);
      continue;
    }
    flush();
  }
  flush();
  return skips;
}

/**
 * 言い直し = 挿入の直後に、挿入と同じ内容が参照側で読み直されている形。
 *
 * 音読で「あるとこ、ある所に」と言い直すと、転写には「あるとこ」が
 * 余分に現れる。これを単なる挿入(読み間違い)と区別する。
 */
function findRestarts(
  ops: readonly EditOp[],
  ref: Normalized,
  minRun: number,
): Restart[] {
  const restarts: Restart[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].kind !== "insert") continue;
    let end = i;
    while (end < ops.length && ops[end].kind === "insert") end += 1;
    const runLength = end - i;
    if (runLength >= minRun) {
      const inserted = ops
        .slice(i, end)
        .map((op) => op.hypChar ?? "")
        .join("");
      // 直後に続く参照側の文字を、挿入と同じ長さだけ取る
      const following: string[] = [];
      for (let k = end; k < ops.length && following.length < runLength; k += 1) {
        const ch = ops[k].refChar;
        if (ch !== null) following.push(ch);
      }
      const repeated = following.join("");
      const distance = align(inserted, repeated).distance;
      if (
        repeated.length === runLength &&
        distance <= Math.floor(runLength / RESTART_TOLERANCE)
      ) {
        const anchor = ops[i].refAnchor;
        restarts.push({
          refAnchor: anchor,
          origIndex: ref.origIndex[anchor] ?? ref.origIndex.length,
          inserted,
          repeated,
          distance,
        });
      }
    }
    i = end - 1;
  }
  return restarts;
}

/**
 * 課題文と認識結果を突き合わせて計量する。
 *
 * @param passageText 課題文の原文(正規化前)
 * @param hypothesisText 認識器が返したテキスト(正規化前)
 */
export function measure(
  passageText: string,
  hypothesisText: string,
  options: MeasureOptions = {},
): Measurement {
  const minSkipRun = options.minSkipRun ?? DEFAULT_MIN_SKIP_RUN;
  const minRestartRun = options.minRestartRun ?? DEFAULT_MIN_RESTART_RUN;
  const durationSec = options.durationSec ?? null;

  const ref = normalize(passageText);
  const hyp = normalize(hypothesisText);
  const alignment = align(ref.text, hyp.text, ref.origIndex);

  // 表記ゆれ許容 — 変換は両側に等しく掛ける
  const canonRef = canonicalize(ref.text);
  const canonHyp = canonicalize(hyp.text);
  const canonAlignment = align(canonRef, canonHyp);

  return {
    strictCER: ratio(alignment.distance, alignment.refLength),
    // 分母は**厳密側の参照長**で揃える。正規形の長さで割ると、
    // 数字表記の統一が参照を縮めた分だけ(五六 → 56)比が持ち上がり、
    // 距離が減っていないのに許容側の方が悪く見える。loop_001 の実測で
    // 24 件 × 置換率 0.4 のうち lenient 0.4035 > strict 0.3981 が出た。
    // 「読むよう求めた文字数」で割ってはじめて二つの指標は比較できる
    lenientCER: ratio(canonAlignment.distance, alignment.refLength),
    breakdown: countOps(alignment.ops),
    skips: findSkips(alignment.ops, ref, passageText, minSkipRun),
    restarts: findRestarts(alignment.ops, ref, minRestartRun),
    charsPerSecond:
      durationSec !== null && durationSec > 0
        ? alignment.hypLength / durationSec
        : null,
    alignment,
  };
}
