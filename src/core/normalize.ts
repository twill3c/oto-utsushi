// =====================================================================
// F-02 テキスト正規化 — 原文位置を失わない写像
//
// 比較のために字面を畳むが、**どの文字が原文のどこ由来か**を必ず持ち帰る。
// これが無いと「機械が聞き落とした場所」を原文の上に印として打てない。
//
// NFKC は 1 文字が複数文字へ展開されることも、2 文字が 1 文字へ合成される
// こともある(半角カナ + 濁点 → 全角カナ)。素朴に 1 文字ずつ正規化すると
// 後者を取り逃すため、**濁点/半濁点の後続だけ先読みして塊にする**。
// この塊分けが標準の NFKC と一致することは checkNfkcChunking() で
// プラットフォームの NFKC を権威として検算する(G-05)。
// =====================================================================
import type { Normalized } from "./types";

/** 半角カナに続いて濁点/半濁点になりうる文字 */
const HALFWIDTH_VOICING = new Set(["ﾞ", "ﾟ"]);

/**
 * 音として現れないので比較から落とす文字(NFKC 適用後の形で列挙する)。
 *
 * 長音符 `ー` と繰り返し記号 `々` は**落とさない** — どちらも読みを持つ。
 * 表記のゆれとしての扱いは variants.ts が受け持つ。
 */
const DROPPED = new Set([
  // 空白
  " ",
  "　",
  "\t",
  "\n",
  "\r",
  // 句読点
  "。",
  "、",
  ",",
  ".",
  "・",
  ":",
  ";",
  "！",
  "!",
  "？",
  "?",
  // 括弧
  "「",
  "」",
  "『",
  "』",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "〔",
  "〕",
  "【",
  "】",
  "〈",
  "〉",
  "《",
  "》",
  // 引用符
  "“",
  "”",
  "‘",
  "’",
  '"',
  "'",
  // ダッシュ・省略記号(長音符 ー とは別物)
  "‐",
  "–",
  "—",
  "―",
  "-",
  "…",
  "‥",
  // その他の記号
  "*",
  "~",
  "〜",
  "～",
  "=",
  "+",
  "/",
  "|",
  " ",
]);

/**
 * 入力を NFKC の塊へ切る。返り値の各要素は
 * `[原文開始インデックス, 原文で消費した長さ, NFKC 適用後の文字列]`。
 */
export function nfkcChunks(src: string): Array<[number, number, string]> {
  const chunks: Array<[number, number, string]> = [];
  const chars = Array.from(src);
  // 原文インデックスは UTF-16 コード単位で数える(String の索引と一致させる)
  let pos = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (next !== undefined && HALFWIDTH_VOICING.has(next)) {
      const pair = ch + next;
      chunks.push([pos, pair.length, pair.normalize("NFKC")]);
      pos += pair.length;
      i += 1;
      continue;
    }
    chunks.push([pos, ch.length, ch.normalize("NFKC")]);
    pos += ch.length;
  }
  return chunks;
}

/**
 * 塊分けが標準の NFKC と一致するかを検算する(G-05)。
 *
 * プラットフォームの `String.prototype.normalize` を権威に置き、
 * 自前の塊分けがそれを再現できているかだけを問う。
 */
export function checkNfkcChunking(src: string): boolean {
  const joined = nfkcChunks(src)
    .map(([, , out]) => out)
    .join("");
  return joined === src.normalize("NFKC");
}

/**
 * 正規化(F-02)。NFKC → 小文字化 → 無音記号の除去。
 *
 * 返す `origIndex` は正規化後の各文字が由来する原文インデックスで、
 * 単調非減少かつ原文の有効範囲内であることを G-05 が保証する。
 */
export function normalize(src: string): Normalized {
  let text = "";
  const origIndex: number[] = [];
  for (const [start, , folded] of nfkcChunks(src)) {
    const lowered = folded.toLowerCase();
    // 索引はコードポイント単位で数える。サロゲートペアの漢字を
    // アライメントが半分に割らないようにするため(align.ts と単位を揃える)
    for (const out of lowered) {
      if (DROPPED.has(out)) continue;
      text += out;
      origIndex.push(start);
    }
  }
  return { text, origIndex };
}

/** 落とされる文字かどうか(テストと UI の強調表示で共有する) */
export function isDropped(ch: string): boolean {
  return DROPPED.has(ch);
}
