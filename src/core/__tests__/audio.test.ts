// T-030〜T-034 / G-06 — 音声前処理
import { describe, expect, it } from "vitest";
import { TARGET_RATE, prepareForRecognition, resample, toMono } from "../audio";

function sine(freq: number, rate: number, samples: number): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  }
  return out;
}

/** 素朴な DFT の振幅。窓長が小さいので総当たりで足りる */
function magnitudes(x: Float32Array): number[] {
  const n = x.length;
  const out: number[] = [];
  for (let k = 0; k < n / 2; k += 1) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const a = (-2 * Math.PI * k * t) / n;
      re += x[t] * Math.cos(a);
      im += x[t] * Math.sin(a);
    }
    out.push(Math.hypot(re, im));
  }
  return out;
}

function rms(x: Float32Array): number {
  let sum = 0;
  for (const v of x) sum += v * v;
  return Math.sqrt(sum / Math.max(1, x.length));
}

const WINDOW = 2048;

/** 端の過渡を避けて出力の中央から窓を切る */
function middle(x: Float32Array, n: number): Float32Array {
  const start = Math.floor((x.length - n) / 2);
  return x.slice(start, start + n);
}

describe("resample", () => {
  it("T-030 / G-06 帯域内の正弦波は周波数を保つ(48 kHz → 16 kHz)", () => {
    // 期待値の出所: 解析解。サンプルレート変換は信号の周波数を変えない
    for (const freq of [440, 1000, 3000]) {
      const input = sine(freq, 48000, WINDOW * 9);
      const out = resample(input, 48000, TARGET_RATE);
      const win = middle(out, WINDOW);
      const mags = magnitudes(win);
      let peak = 0;
      for (let k = 1; k < mags.length; k += 1) {
        if (mags[k] > mags[peak]) peak = k;
      }
      const expected = Math.round((freq * WINDOW) / TARGET_RATE);
      expect(Math.abs(peak - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("T-031 / G-06 ナイキストを超える成分は折り返さず落ちる", () => {
    // 出力の 16 kHz でのナイキストは 8 kHz。10 kHz は通ってはならない。
    // 素朴な間引きだと 6 kHz へ化けて帯域内に現れる
    const reference = resample(sine(1000, 48000, WINDOW * 9), 48000, TARGET_RATE);
    const aliasing = resample(sine(10000, 48000, WINDOW * 9), 48000, TARGET_RATE);
    const ratio = rms(middle(aliasing, WINDOW)) / rms(middle(reference, WINDOW));
    const dB = 20 * Math.log10(ratio);
    expect(dB).toBeLessThanOrEqual(-30);
  });

  it("T-032 複数チャンネルは平均されてモノラルになる", () => {
    const left = Float32Array.from([1, 1, 1]);
    const right = Float32Array.from([-1, 0, 1]);
    expect(Array.from(toMono([left, right]))).toEqual([0, 0.5, 1]);
    expect(Array.from(toMono([left]))).toEqual([1, 1, 1]);
    expect(toMono([])).toHaveLength(0);
  });

  it("T-032b チャンネル長が違えば短い方に揃える", () => {
    const a = Float32Array.from([1, 1, 1, 1]);
    const b = Float32Array.from([1, 1]);
    expect(toMono([a, b])).toHaveLength(2);
  });

  it("T-033 同じレートなら恒等(サンプル列が一致)", () => {
    const x = sine(440, TARGET_RATE, 512);
    const y = resample(x, TARGET_RATE, TARGET_RATE);
    expect(Array.from(y)).toEqual(Array.from(x));
    expect(y).not.toBe(x); // 呼び出し側の配列を共有しない
  });

  it("T-034 長さ 0 の入力で例外を投げない", () => {
    expect(resample(new Float32Array(0), 48000, TARGET_RATE)).toHaveLength(0);
    expect(prepareForRecognition([], 48000)).toHaveLength(0);
  });

  it("不正なサンプルレートは落とす", () => {
    expect(() => resample(sine(440, 48000, 16), 0, TARGET_RATE)).toThrow();
    expect(() => resample(sine(440, 48000, 16), 48000, 0)).toThrow();
  });

  it("アップサンプルもできる(8 kHz → 16 kHz で長さが倍)", () => {
    const out = resample(sine(440, 8000, 800), 8000, TARGET_RATE);
    expect(out.length).toBe(1600);
  });

  it("prepareForRecognition が 16 kHz モノラルを返す", () => {
    const left = sine(440, 48000, 4800);
    const right = sine(440, 48000, 4800);
    const out = prepareForRecognition([left, right], 48000);
    expect(out.length).toBe(1600);
  });
});
