// =====================================================================
// F-06 表記ゆれ辞書 — 「読みが同じなら聞き取れている」を機械化する
//
// 認識結果と原文が字面で違っても、読みが同じなら機械は聞き取れている。
// 「三十三」対「33」を誤りに数えると、機械の失敗ではなく**表記の選択**を
// 測ってしまう。そこで読みを保つ変換だけを集めた辞書を持ち、
// 厳密 CER と並べて「表記ゆれ許容 CER」を出す(SPEC §4)。
//
// 規律:
//   - **統計から自動生成しない。** よく間違える対を許容表へ取り込むと、
//     指標が自分を甘くする方向へ動く(SPEC §4)
//   - 収録するのは**読みを変えないことが決定論的に言える**変換だけ
//   - 変換は参照側と転写側の**両方に等しく**掛ける。片側だけに掛けない
// =====================================================================

/**
 * 旧字 → 新字。
 *
 * 課題文は新字新仮名の作品に限る(SPEC N-07)ため参照側にはまず現れないが、
 * 認識器が旧字を出す場合に備える。**確信のある対だけを載せる**方針で、
 * 常用漢字表(内閣告示)の「いわゆる康熙字典体」欄に対応が明記されている
 * ものから採った。網羅表ではない — 迷う対は載せないことを優先する。
 */
export const OLD_TO_NEW: ReadonlyMap<string, string> = new Map([
  ["國", "国"],
  ["學", "学"],
  ["體", "体"],
  ["圓", "円"],
  ["廣", "広"],
  ["假", "仮"],
  ["舊", "旧"],
  ["齒", "歯"],
  ["觀", "観"],
  ["聲", "声"],
  ["對", "対"],
  ["讀", "読"],
  ["賣", "売"],
  ["晝", "昼"],
  ["圖", "図"],
  ["當", "当"],
  ["醫", "医"],
  ["藝", "芸"],
  ["眞", "真"],
  ["氣", "気"],
  ["發", "発"],
  ["縣", "県"],
  ["歸", "帰"],
  ["邊", "辺"],
  ["應", "応"],
  ["轉", "転"],
  ["傳", "伝"],
  ["佛", "仏"],
  ["來", "来"],
  ["兩", "両"],
  ["戰", "戦"],
  ["驛", "駅"],
  ["鐵", "鉄"],
  ["關", "関"],
  ["靜", "静"],
  ["顏", "顔"],
  ["樣", "様"],
  ["變", "変"],
  ["輕", "軽"],
  ["續", "続"],
]);

const KANJI_DIGITS: ReadonlyMap<string, number> = new Map([
  ["〇", 0],
  ["零", 0],
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

const KANJI_SMALL_UNITS: ReadonlyMap<string, number> = new Map([
  ["十", 10],
  ["百", 100],
  ["千", 1000],
]);

const KANJI_LARGE_UNITS: ReadonlyMap<string, number> = new Map([
  ["万", 10000],
  ["億", 100000000],
]);

/**
 * これを超える桁の数字表記には手を触れない。
 * `Number` の安全整数を超えると指数表記へ化け、二度掛けで結果が変わる
 * (G-09 の冪等性が壊れる)。
 */
const MAX_NUMERAL_DIGITS = 15;

function isNumeralChar(ch: string): boolean {
  return (
    KANJI_DIGITS.has(ch) ||
    KANJI_SMALL_UNITS.has(ch) ||
    KANJI_LARGE_UNITS.has(ch)
  );
}

/**
 * 漢数字の連なりを整数へ。解釈できなければ null。
 *
 * ■ なぜこんなに臆病なのか(loop_001 実測)
 *
 * 最初は「位取りを含まない連なりは桁の並び」(「一九四五」→ 1945)も
 * 解釈していた。これが読みを変えることがカタログの実データで判明した:
 *
 *     千島(ちしま)   → 1000島   固有名詞
 *     五六寸(ごろく) → 56寸     「五、六」の概数
 *     三つ(みっつ)   → 3つ      和語の読み
 *
 * カタログ 24 件のうち 18 件が漢数字を含むが、**単字の漢数字はほとんど
 * 数として読まれていない**(一切・一口・一向・百姓・九州・十分の一)。
 * 辞書の収録基準は「読みを変えないことが決定論的に言える変換だけ」なので、
 * この規則は基準を満たしていなかった。
 *
 * ■ いま残している規則
 *
 * **位取り(十百千万億)を含み、かつ 2 文字以上**の連なりだけを解く。
 *
 *     三十三 → 33     二千三百 → 2300     一万 → 10000     二十 → 20
 *     千     → 触らない(1 文字)
 *     五六   → 触らない(位取りが無い)
 *
 * 年号の「一九二七」は解けなくなったが、**解けないことと間違えることは
 * 違う**。この規則でも残る誤りは EXCEPTIONS に列挙する。
 */
export function kanjiToNumber(run: string): number | null {
  const chars = Array.from(run);
  if (chars.length < 2) return null;
  if (!chars.every(isNumeralChar)) return null;
  // 安全整数を超える桁は触らない(指数表記へ化けて冪等性が壊れる)
  if (chars.length > MAX_NUMERAL_DIGITS) return null;
  // 位取りを含まない連なりは数として読まれるとは限らない(上の実測)
  const hasUnit = chars.some(
    (c) => KANJI_SMALL_UNITS.has(c) || KANJI_LARGE_UNITS.has(c),
  );
  if (!hasUnit) return null;

  let total = 0; // 万・億で確定した分
  let section = 0; // 現在の万未満の区画
  let digit: number | null = null; // 直前の数字
  for (const c of chars) {
    if (KANJI_DIGITS.has(c)) {
      // 位取りが出たあとに桁並びが来る形(「十九四五」)は解釈しない
      if (digit !== null) return null;
      digit = KANJI_DIGITS.get(c) as number;
      continue;
    }
    const small = KANJI_SMALL_UNITS.get(c);
    if (small !== undefined) {
      section += (digit ?? 1) * small;
      digit = null;
      continue;
    }
    const large = KANJI_LARGE_UNITS.get(c) as number;
    const body = section + (digit ?? 0);
    if (body === 0) return null; // 「万」単独などは解釈しない
    total += body * large;
    section = 0;
    digit = null;
  }
  return total + section + (digit ?? 0);
}

/** カタカナをひらがなへ畳む(読みは変わらない) */
function katakanaToHiragana(ch: string): string {
  const code = ch.codePointAt(0);
  if (code === undefined) return ch;
  // U+30A1..U+30F6 のみ。長音符 U+30FC と中点は対象外
  if (code >= 0x30a1 && code <= 0x30f6) {
    return String.fromCodePoint(code - 0x60);
  }
  return ch;
}

/** 繰り返し記号 `々` を直前の文字で置き換える(「人々」→「人人」) */
export function expandIteration(src: string): string {
  let out = "";
  for (const ch of src) {
    if (ch === "々" && out.length > 0) {
      out += Array.from(out).slice(-1)[0];
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 位取りを含んでいてもなお数として読まれない熟語。
 *
 * kanjiToNumber の規則(位取りあり・2 文字以上)を通ってしまうが、
 * 変換すると読みが変わるもの。**網羅表ではない** — 気づいたものを足す
 * 手作りの表であり、ここに無い誤りが残っていることを前提に読むこと。
 * 出所は国語辞典的な常識(いずれも数として読まない固有名詞・和語)。
 */
export const NUMERAL_EXCEPTIONS: ReadonlySet<string> = new Set([
  "八百", // 八百屋(やおや)・八百長(やおちょう)
  "五十", // 五十嵐(いがらし)
  "四十", // 四十雀(しじゅうから)
  "十六", // 十六夜(いざよい)
  "五月", // 五月雨(さみだれ)— 月は位取りではないが並びで拾われうる
]);

/** 数字表記を算用数字へ揃える(漢数字・算用数字の双方を同じ形へ) */
export function canonicalizeNumerals(src: string): string {
  const chars = Array.from(src);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch >= "0" && ch <= "9") {
      let run = "";
      while (i < chars.length && chars[i] >= "0" && chars[i] <= "9") {
        run += chars[i];
        i += 1;
      }
      // 先頭の 0 を落として桁を揃える(「007」と「7」を同じ形へ)。
      // 安全整数を超える桁はそのまま置く(kanjiToNumber と同じ理由)
      out += run.length > MAX_NUMERAL_DIGITS ? run : String(Number(run));
      continue;
    }
    if (isNumeralChar(ch)) {
      let run = "";
      while (i < chars.length && isNumeralChar(chars[i])) {
        run += chars[i];
        i += 1;
      }
      const value = NUMERAL_EXCEPTIONS.has(run) ? null : kanjiToNumber(run);
      out += value === null ? run : String(value);
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * 表記ゆれの正規形。**適用順は固定**(SPEC G-09 の合流性はこの順序を前提とする):
 *
 *   1. 繰り返し記号の展開
 *   2. 旧字 → 新字
 *   3. カタカナ → ひらがな
 *   4. 数字表記の統一
 */
export function canonicalize(src: string): string {
  let out = expandIteration(src);
  out = Array.from(out)
    .map((c) => OLD_TO_NEW.get(c) ?? c)
    .map(katakanaToHiragana)
    .join("");
  return canonicalizeNumerals(out);
}
