// T-042 / G-09 — 表記ゆれ辞書の健全性
import { describe, expect, it } from "vitest";
import {
  NUMERAL_EXCEPTIONS,
  OLD_TO_NEW,
  canonicalize,
  canonicalizeNumerals,
  expandIteration,
  kanjiToNumber,
} from "../variants";
import { PASSAGES } from "../catalog";
import { normalize } from "../normalize";

describe("variants", () => {
  it("T-042 旧字→新字の各エントリが恒等でなく、連鎖も循環もしない", () => {
    for (const [oldForm, newForm] of OLD_TO_NEW) {
      expect(oldForm).not.toBe(newForm);
      expect(Array.from(oldForm)).toHaveLength(1);
      expect(Array.from(newForm)).toHaveLength(1);
      // 値が別のキーになっていると適用順で結果が変わる(合流性が壊れる)
      expect(OLD_TO_NEW.has(newForm)).toBe(false);
    }
  });

  it("T-042b canonicalize は冪等(二度掛けても変わらない)", () => {
    const samples = [
      "人々の國",
      "コーヒーを三杯",
      "一九四五年",
      "千島桔梗と八百屋",
      "007号室",
      "々",
      "",
      "二千三百五十六",
      "十",
      "眞實を讀む",
      ...PASSAGES.slice(0, 8).map((p) => normalize(p.text).text),
    ];
    for (const s of samples) {
      const once = canonicalize(s);
      expect(canonicalize(once)).toBe(once);
    }
  });

  it("繰り返し記号を直前の文字で展開する", () => {
    expect(expandIteration("人々")).toBe("人人");
    expect(expandIteration("時々刻々")).toBe("時時刻刻");
    // 先頭に来た場合は展開しようがないので残す
    expect(expandIteration("々あ")).toBe("々あ");
  });

  it("位取りを含む 2 文字以上の漢数字だけを読む", () => {
    expect(kanjiToNumber("三十三")).toBe(33);
    expect(kanjiToNumber("二千三百")).toBe(2300);
    expect(kanjiToNumber("五万六千七百八十九")).toBe(56789);
    expect(kanjiToNumber("一万")).toBe(10000);
    expect(kanjiToNumber("二十")).toBe(20);
    expect(kanjiToNumber("十四")).toBe(14);
  });

  it("読みを変えかねない形には触れない(loop_001 実測)", () => {
    // 実測値の出所: data/passages.json の 24 件を走査(2026-08-29)。
    // 単字の漢数字はほとんど数として読まれていない
    expect(kanjiToNumber("千")).toBeNull(); // 千島(ちしま)
    expect(kanjiToNumber("十")).toBeNull(); // 十分(じゅうぶん)
    expect(kanjiToNumber("三")).toBeNull(); // 三つ(みっつ)
    expect(kanjiToNumber("五六")).toBeNull(); // 五六寸(ごろくすん)= 概数
    expect(kanjiToNumber("一九四五")).toBeNull(); // 位取りが無い桁並び
    expect(kanjiToNumber("")).toBeNull();
    expect(kanjiToNumber("あ")).toBeNull();
    expect(kanjiToNumber("万")).toBeNull(); // 本体の無い単位
    expect(canonicalizeNumerals("千島桔梗")).toBe("千島桔梗");
    expect(canonicalizeNumerals("五六寸")).toBe("五六寸");
  });

  it("位取りを通っても数でない熟語は例外表で止める", () => {
    expect(NUMERAL_EXCEPTIONS.has("八百")).toBe(true);
    expect(canonicalizeNumerals("八百屋")).toBe("八百屋");
    expect(canonicalizeNumerals("五十嵐")).toBe("五十嵐");
    // 例外表は網羅していない。止まる範囲を明示しておく
    for (const word of NUMERAL_EXCEPTIONS) {
      expect(canonicalizeNumerals(word)).toBe(word);
    }
  });

  it("算用数字と漢数字が同じ形へ揃う", () => {
    expect(canonicalizeNumerals("三十三")).toBe("33");
    expect(canonicalizeNumerals("33")).toBe("33");
    expect(canonicalizeNumerals("007号")).toBe("7号");
    expect(canonicalizeNumerals("あ")).toBe("あ");
  });

  it("安全整数を超える桁には手を触れない(冪等性を守るため)", () => {
    const huge = "1".repeat(20);
    expect(canonicalizeNumerals(huge)).toBe(huge);
    expect(kanjiToNumber("一".repeat(20))).toBeNull();
  });

  it("カタカナはひらがなへ畳まれ、長音符は残る", () => {
    expect(canonicalize("コーヒー")).toBe("こーひー");
    expect(canonicalize("ヴァイオリン")).toBe("ゔぁいおりん");
  });

  it("G-09 変換は読みを保つ — 参照側と転写側の同じ入力は同じ正規形になる", () => {
    const pairs: Array<[string, string]> = [
      ["人々", "人人"],
      ["コーヒー", "こーひー"],
      ["三十三", "33"],
      ["二十", "20"],
      ["國", "国"],
      ["時々", "時時"],
    ];
    for (const [a, b] of pairs) expect(canonicalize(a)).toBe(canonicalize(b));
  });
});
