// T-001〜T-005 / G-05 — 正規化と位置写像
import { describe, expect, it } from "vitest";
import { PASSAGES } from "../catalog";
import { checkNfkcChunking, isDropped, normalize } from "../normalize";

/** origIndex が SPEC G-05 の三条件を満たすかを検算する */
function assertMappingSound(src: string) {
  const { text, origIndex } = normalize(src);
  const chars = Array.from(text);
  expect(origIndex).toHaveLength(chars.length);
  for (let i = 0; i < origIndex.length; i += 1) {
    expect(origIndex[i]).toBeGreaterThanOrEqual(0);
    expect(origIndex[i]).toBeLessThan(src.length);
    if (i > 0) expect(origIndex[i]).toBeGreaterThanOrEqual(origIndex[i - 1]);
  }
}

describe("normalize", () => {
  it("T-001 かなのみの入力では恒等で、origIndex も恒等になる", () => {
    const src = "あるところにおじいさんがいました";
    const { text, origIndex } = normalize(src);
    expect(text).toBe(src);
    expect(origIndex).toEqual([...src].map((_, i) => i));
  });

  it("T-002 全角英数と半角カナが NFKC で畳まれ、origIndex は単調非減少", () => {
    // 半角カナ + 濁点 は 2 文字が 1 文字へ合成される。ここを取り逃すと
    // 塊分けが標準 NFKC からずれる
    const src = "ﾊﾞｽ　Ａｂｃ　１２３";
    const { text } = normalize(src);
    expect(text).toBe("バス abc 123".replace(/ /g, ""));
    assertMappingSound(src);
  });

  it("T-002b 塊分けが標準の NFKC を再現する(プラットフォームが権威)", () => {
    const samples = [
      "ﾊﾞｽ",
      "ﾊﾟﾝ",
      "ｶﾞｷﾞｸﾞｹﾞｺﾞ",
      "㈱と㌢と㍑",
      "Ａ１ｱ",
      "ふつうの文章です。",
    ];
    for (const s of samples) expect(checkNfkcChunking(s)).toBe(true);
  });

  it("T-003 句読点・括弧・ダッシュ・空白が落ち、残りは原文の実位置を指す", () => {
    const src = "「あ、い」——う。";
    const { text, origIndex } = normalize(src);
    expect(text).toBe("あいう");
    // 原文の該当位置を引き直すと元の文字に戻る
    expect([...text].map((_, i) => src[origIndex[i]]).join("")).toBe("あいう");
  });

  it("T-003b 長音符と繰り返し記号は落とさない(どちらも読みを持つ)", () => {
    expect(normalize("コーヒー").text).toBe("コーヒー");
    expect(normalize("人々").text).toBe("人々");
    expect(isDropped("ー")).toBe(false);
    expect(isDropped("々")).toBe(false);
    expect(isDropped("。")).toBe(true);
  });

  it("T-004 空文字と記号のみの入力で例外を投げず空を返す", () => {
    expect(normalize("").text).toBe("");
    expect(normalize("").origIndex).toEqual([]);
    expect(normalize("。、「」——…　").text).toBe("");
  });

  it("T-005 同一入力を二度正規化しても JSON 等値(G-10 決定論)", () => {
    const src = PASSAGES[0].text;
    expect(JSON.stringify(normalize(src))).toBe(JSON.stringify(normalize(src)));
  });

  it("G-05 カタログ全件で写像が健全", () => {
    for (const p of PASSAGES) {
      assertMappingSound(p.text);
      expect(checkNfkcChunking(p.text)).toBe(true);
      expect(normalize(p.text).text.length).toBeGreaterThan(0);
    }
  });
});
