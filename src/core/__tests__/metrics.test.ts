// T-020〜T-025 / G-02 / G-04 — 計量
import { describe, expect, it } from "vitest";
import { PASSAGES } from "../catalog";
import { measure } from "../metrics";
import { normalize } from "../normalize";

/** シード付きの線形合同法。テストを決定論に保つ(G-10) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * 陽性対照の素材。参照の正規化列から割合 p の位置を、
 * **参照に現れない文字**へ置き換えた転写を作る。
 * 置換文字が参照に無いので、編集距離は置換した個数にちょうど等しくなる。
 */
function substituteRate(refNormalized: string, p: number, seed: number) {
  const chars = Array.from(refNormalized);
  const filler = "ゐ";
  expect(chars).not.toContain(filler);
  const rand = lcg(seed);
  const target = Math.floor(chars.length * p);
  const indices = chars
    .map((_, i) => ({ i, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, target)
    .map((x) => x.i);
  for (const i of indices) chars[i] = filler;
  return { hyp: chars.join(""), substituted: indices.length };
}

const SAMPLE = PASSAGES[1]; // 芥川竜之介『鼻』— 漢数字を含む

describe("measure", () => {
  it("T-020 / G-04 陽性対照: 置換率が厳密 CER に現れる", () => {
    const ref = normalize(SAMPLE.text).text;
    for (const p of [0, 0.1, 0.3, 0.5, 1.0]) {
      const { hyp, substituted } = substituteRate(ref, p, 20260829);
      const m = measure(SAMPLE.text, hyp);
      // 置換文字は参照に無いので、距離は置換個数に一致するはず
      expect(m.alignment.distance).toBe(substituted);
      // 許容幅は SPEC G-04 の +-0.02 をそのまま使う。置換個数は
      // floor(N*p) に量子化されるので、これより狭い幅を書くと
      // 正しい実装を落とす(vitest の toBeCloseTo(p, 2) は +-0.005)
      expect(Math.abs((m.strictCER as number) - p)).toBeLessThanOrEqual(0.02);
    }
  });

  it("T-020b 参照が空なら CER は null(0 除算を作らない)", () => {
    const m = measure("。、「」", "なにか");
    expect(m.strictCER).toBeNull();
    expect(m.lenientCER).toBeNull();
  });

  it("T-021 / G-02 合成復元: 検出距離は注入コスト以下で、単調に増える", () => {
    const ref = normalize(SAMPLE.text).text;
    const detected: number[] = [];
    const injected = [0, 2, 5, 10, 20];
    for (const k of injected) {
      const chars = Array.from(ref);
      const rand = lcg(31 + k);
      for (let n = 0; n < k; n += 1) {
        const at = Math.floor(rand() * chars.length);
        chars[at] = "ゐ";
      }
      const m = measure(SAMPLE.text, chars.join(""));
      // DP は最小コストを返すので、注入したコストを超えることはない
      expect(m.alignment.distance).toBeLessThanOrEqual(k);
      detected.push(m.alignment.distance);
    }
    for (let i = 1; i < detected.length; i += 1) {
      expect(detected[i]).toBeGreaterThanOrEqual(detected[i - 1]);
    }
  });

  it("T-022 読み飛ばしは連続削除がしきい値以上のときだけ数える", () => {
    const src = "あいうえおかきくけこさしすせそたちつてとなにぬねの";
    const ref = normalize(src).text;
    const chars = Array.from(ref);
    // 8 文字を続けて落とす
    const long = [...chars.slice(0, 10), ...chars.slice(18)].join("");
    const m = measure(src, long);
    expect(m.skips).toHaveLength(1);
    expect(m.skips[0].length).toBe(8);
    expect(m.skips[0].text).toBe(src.slice(10, 18));
    expect(m.skips[0].origStart).toBe(10);
    expect(m.skips[0].origEnd).toBe(18);

    // 3 文字ならしきい値(既定 5)に届かないので数えない
    const short = [...chars.slice(0, 10), ...chars.slice(13)].join("");
    expect(measure(src, short).skips).toHaveLength(0);
    // しきい値を下げれば数える
    expect(measure(src, short, { minSkipRun: 3 }).skips).toHaveLength(1);
  });

  it("T-022b 読み飛ばしの原文範囲は句読点を含めて原文と一致する", () => {
    const src = "あいうえお、かきくけこ。さしすせそ";
    const m = measure(src, "あいうえおさしすせそ");
    expect(m.skips).toHaveLength(1);
    // 範囲は最初に飛ばされた文字から始まる。手前の読点は読まれているので
    // 入らない。末尾の句点は「次の参照文字まで」を取るので入る
    expect(m.skips[0].text).toBe("かきくけこ。");
  });

  it("T-023 言い直しを単なる挿入と区別する", () => {
    const src = "あるところにおじいさんがいました";
    // 「あるとこ」まで読んで言い直した形
    const m = measure(src, "あるところあるところにおじいさんがいました");
    expect(m.restarts).toHaveLength(1);
    expect(m.restarts[0].inserted).toBe("あるところ");
    expect(m.restarts[0].repeated).toBe("あるところ");
    expect(m.restarts[0].distance).toBe(0);

    // 無関係な語の挿入は言い直しにしない
    const other = measure(src, "あるところにねこがおじいさんがいました");
    expect(other.restarts).toHaveLength(0);
  });

  it("T-024 表記ゆれ許容 CER は表記だけの違いを 0 にする", () => {
    // 参照はカタカナと漢数字、転写はひらがなと算用数字 — 読みは同じ。
    // 漢数字は位取りを含む形でないと触らない(variants.ts の実測を参照)
    const src = "コーヒーを二十杯のみました";
    const m = measure(src, "こーひーを20杯のみました");
    expect(m.strictCER).toBeGreaterThan(0);
    expect(m.lenientCER).toBe(0);
  });

  it("T-024b カタログ全件: 表記だけを変えた転写は許容側で 0 になる", () => {
    // 転写側の表記ゆれは、variants.ts を使わずにこのテスト内で作る。
    // core の正規形が「独立に作った表記ゆれ」を吸収できるかを見る
    const surfaceVariant = (s: string) =>
      Array.from(s)
        .map((ch) => {
          const code = ch.codePointAt(0) as number;
          // カタカナ → ひらがな
          if (code >= 0x30a1 && code <= 0x30f6) {
            return String.fromCodePoint(code - 0x60);
          }
          return ch;
        })
        .join("");

    let varied = 0;
    for (const p of PASSAGES) {
      const ref = normalize(p.text).text;
      const hyp = surfaceVariant(ref);
      const m = measure(p.text, hyp);
      expect(m.lenientCER).toBe(0);
      if (hyp !== ref) varied += 1;
      // 表記が実際に変わった課題文では、厳密側はちゃんと差を出す
      if (hyp !== ref) expect(m.strictCER as number).toBeGreaterThan(0);
    }
    // 表記ゆれが 1 件も起きない選定なら、この検査は何も見ていない
    expect(varied).toBeGreaterThan(0);
  });

  it("T-024c 許容側が厳密側を上回りうる(既知の機構を明示しておく)", () => {
    // SPEC 初稿は「許容側が厳しくなることはない」と書いていたが、
    // loop_001 の実測(カタログ 24 件 × 置換率 3 段で 7/72 件)で否定された。
    // 機構は繰り返し記号の展開である — 直前の文字を写すので、
    // その文字の誤りが 2 文字に増幅される
    const m = measure("人々の心", "ゐ々の心");
    expect(m.strictCER).toBe(0.25); // 4 文字中 1 文字の置換
    expect(m.lenientCER).toBe(0.5); // 人人 対 ゐゐ で 2 文字ぶんの差
    // 分母は両者とも厳密側の参照長で揃えてある(比較可能にするため)
    expect(m.alignment.refLength).toBe(4);
  });

  it("T-025 読速は継続時間が正のときだけ出す", () => {
    const src = "あいうえお";
    expect(measure(src, "あいうえお", { durationSec: 2 }).charsPerSecond).toBe(
      2.5,
    );
    expect(measure(src, "あいうえお").charsPerSecond).toBeNull();
    expect(
      measure(src, "あいうえお", { durationSec: 0 }).charsPerSecond,
    ).toBeNull();
    expect(
      measure(src, "あいうえお", { durationSec: -1 }).charsPerSecond,
    ).toBeNull();
  });

  it("G-10 同一入力で計量が JSON 等値", () => {
    const a = measure(SAMPLE.text, "禅智内供の鼻と云えば", { durationSec: 3 });
    const b = measure(SAMPLE.text, "禅智内供の鼻と云えば", { durationSec: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
