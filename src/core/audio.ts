// =====================================================================
// F-05 音声前処理 — 任意のサンプルレートを 16 kHz モノラルへ
//
// Whisper 系の音響前処理は 16 kHz モノラルを前提にする。マイクは機器差で
// 44.1 / 48 kHz を返すため、ここで揃える。
//
// 素朴に間引くと**折り返し(エイリアシング)**が起きる。8 kHz を超える成分が
// 帯域内へ化けて入り、認識器には「元の音には無かった音」が届く。
// 窓関数付き sinc を畳み込んで帯域制限と補間を同時に行う。
//
// DOM にも AudioContext にも依存しない純関数(SPEC N-02)。
// =====================================================================

/** 目標サンプルレート */
export const TARGET_RATE = 16000;

/** sinc カーネルの片側ローブ数。大きいほど遷移が急峻になり計算量が増える */
const LOBES = 16;

function sinc(x: number): number {
  if (x === 0) return 1;
  const t = Math.PI * x;
  return Math.sin(t) / t;
}

/** Blackman 窓。|t| <= 1 の外では 0 */
function blackman(t: number): number {
  if (t < -1 || t > 1) return 0;
  return 0.42 + 0.5 * Math.cos(Math.PI * t) + 0.08 * Math.cos(2 * Math.PI * t);
}

/** 複数チャンネルを平均してモノラルにする */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return new Float32Array(channels[0]);
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * サンプルレート変換。
 *
 * 遮断周波数は入力と出力のナイキストの低い方に置く。ダウンサンプル時は
 * これが折り返し防止の低域通過になり、アップサンプル時は補間になる。
 */
export function resample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate <= 0 || targetRate <= 0) {
    throw new Error(`サンプルレートが不正: ${sourceRate} → ${targetRate}`);
  }
  if (input.length === 0) return new Float32Array(0);
  if (sourceRate === targetRate) return new Float32Array(input);

  const ratio = targetRate / sourceRate;
  // 入力レートで正規化した遮断周波数(0.5 が入力のナイキスト)
  const fc = 0.5 * Math.min(1, ratio);
  const half = LOBES / (2 * fc);

  const outLength = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLength);

  for (let k = 0; k < outLength; k += 1) {
    const center = k / ratio;
    const first = Math.ceil(center - half);
    const last = Math.floor(center + half);
    let acc = 0;
    let weight = 0;
    for (let i = first; i <= last; i += 1) {
      const d = i - center;
      const w = blackman(d / half) * sinc(2 * fc * d);
      weight += w;
      if (i < 0 || i >= input.length) continue;
      acc += input[i] * w;
    }
    // 重みで割って直流利得を 1 に保つ(端で減衰しないようにする)
    out[k] = weight === 0 ? 0 : acc / weight;
  }
  return out;
}

/** マイク入力(チャンネル配列)を認識器へ渡せる形へ整える */
export function prepareForRecognition(
  channels: readonly Float32Array[],
  sourceRate: number,
): Float32Array {
  return resample(toMono(channels), sourceRate, TARGET_RATE);
}
