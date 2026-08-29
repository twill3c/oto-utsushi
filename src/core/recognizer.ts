// =====================================================================
// F-07 認識エンジンの境界 — 循環の禁止をここで型にする
//
// このプロジェクトの測定は「参照テキストが認識器に届かないこと」の上に
// 立っている(SPEC N-06)。Whisper には initial_prompt に文脈を与えて
// 精度を上げる正当な使い方があるが、ここでそれをやると
// **自分の答案を採点に混ぜる**ことになり、測定値が意味を失う。
//
// したがって認識器の入力型には音声しか無い。プロンプトも語彙ヒントも
// 課題文 ID すら渡さない。型で塞ぎ、実行時にも塞ぐ(G-03)。
// =====================================================================

/** 認識器へ渡せる唯一の入力。テキストを表す欄を持たない */
export interface RecognitionInput {
  /** 16 kHz モノラルの波形 */
  readonly audio: Float32Array;
  /** 常に 16000。audio.ts の TARGET_RATE と揃える */
  readonly sampleRate: number;
  /** 認識させる言語 */
  readonly language: "ja";
}

export interface RecognitionResult {
  /** 認識されたテキスト */
  readonly text: string;
  /** 音声の長さ(秒)。読速の分母になる */
  readonly durationSec: number;
  /** 実装の識別子(例: `whisper-base-q4/webgpu`) */
  readonly engine: string;
}

export interface Recognizer {
  readonly name: string;
  recognize(input: RecognitionInput): Promise<RecognitionResult>;
}

/** RecognitionInput に許される欄。これ以外があれば循環の疑いがある */
export const ALLOWED_INPUT_KEYS: readonly string[] = [
  "audio",
  "sampleRate",
  "language",
];

/**
 * 実行時の循環検査(G-03)。
 *
 * 型は将来の書き換えで緩む。欄が増えていないことを実行時にも確かめ、
 * 増えていたら**認識を実行せずに落とす**。指標が静かに甘くなるより、
 * ここで止まる方がよい。
 */
export function assertNoReferenceLeak(input: RecognitionInput): void {
  const keys = Object.keys(input).sort();
  const allowed = [...ALLOWED_INPUT_KEYS].sort();
  const extra = keys.filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw new Error(
      `循環の禁止(SPEC N-06): 認識器の入力に許されない欄がある: ${extra.join(", ")}`,
    );
  }
  if (input.sampleRate !== 16000) {
    throw new Error(
      `認識器には 16 kHz を渡す(SPEC F-05): sampleRate=${input.sampleRate}`,
    );
  }
}
