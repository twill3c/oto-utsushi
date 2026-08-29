// =====================================================================
// F-07 ブラウザ内 Whisper — ネットワークに触れる唯一の場所
//
// SPEC N-04 は「音声も認識結果もネットワークへ出さない」と定める。
// 例外は**重みを取ってくること**だけで、その例外はこのファイルに閉じる。
// ここ以外で fetch を書いたら T-051 が落ちる。
//
// ライブラリは**動的 import する**。module 直下で読むと静的書き出しの
// prerender(Node 側)で評価され、ビルドが落ちる(HC-052)。
// =====================================================================
import { TARGET_RATE } from "@/core/audio";
import { type Device, dtypeFor } from "@/core/models";
import { isSafariUA, wasmPaths } from "@/core/runtime";
import {
  type RecognitionInput,
  type RecognitionResult,
  type Recognizer,
  assertNoReferenceLeak,
} from "@/core/recognizer";

export interface LoadProgress {
  /** 落としているファイル名 */
  file: string;
  /** 0..1。不明なら null */
  ratio: number | null;
}

/** WebGPU が使えるか。使えなければ WebAssembly へ退避する */
export async function detectDevice(): Promise<Device> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } })
    .gpu;
  if (gpu === undefined) return "wasm";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter === null ? "wasm" : "webgpu";
  } catch {
    return "wasm";
  }
}

/** onnxruntime-web が単スレッドへ落ちていないか(黙って落ちるので拾う) */
export function isCrossOriginIsolated(): boolean {
  return typeof globalThis.crossOriginIsolated === "boolean"
    ? globalThis.crossOriginIsolated
    : false;
}

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string }>;

/**
 * Whisper の認識器。
 *
 * **入力は音声だけ。** `language` は "ja" 固定で渡すが、これは課題文由来の
 * 情報ではない(どの課題文を選んでも同じ値)。プロンプトも語彙ヒントも渡さない
 * — 渡すとこのアプリが測っているものが消える(SPEC N-06)。
 */
export class WhisperRecognizer implements Recognizer {
  readonly name: string;
  private readonly modelId: string;
  private readonly device: Device;
  private transcriber: Transcriber | null = null;

  constructor(modelId: string, device: Device) {
    this.modelId = modelId;
    this.device = device;
    this.name = `${modelId}/${device}`;
  }

  /** 重みを落として組み立てる。二度目以降はブラウザのキャッシュが効く */
  async load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (this.transcriber !== null) return;
    const { pipeline, env } = await import("@huggingface/transformers");
    // 自オリジンにモデルを探しに行かせない(置いていない — SPEC N-03)
    env.allowLocalModels = false;
    // 実行系の取得先と版を、こちらで固定する。既定に任せると
    // ブラウザで取得先が割れ、版もライブラリの都合で動く(HC-050)
    const onnx = env.backends?.onnx as
      | { wasm?: { wasmPaths?: unknown } }
      | undefined;
    if (onnx?.wasm !== undefined) {
      onnx.wasm.wasmPaths = wasmPaths(isSafariUA(navigator.userAgent));
    }

    const built = await pipeline(
      "automatic-speech-recognition",
      this.modelId,
      {
        device: this.device,
        dtype: dtypeFor(this.device),
        progress_callback: (p: unknown) => {
          if (onProgress === undefined) return;
          const rec = p as { file?: string; progress?: number; status?: string };
          if (rec.status !== "progress") return;
          onProgress({
            file: rec.file ?? "",
            ratio:
              typeof rec.progress === "number" ? rec.progress / 100 : null,
          });
        },
      } as never,
    );
    this.transcriber = built as unknown as Transcriber;
  }

  async recognize(input: RecognitionInput): Promise<RecognitionResult> {
    // 型は将来の書き換えで緩む。実行前に欄の増加を止める(G-03)
    assertNoReferenceLeak(input);
    if (this.transcriber === null) {
      throw new Error("load() を先に呼ぶこと");
    }
    const output = await this.transcriber(input.audio, {
      language: input.language,
      task: "transcribe",
      // 30 秒を超える音声は分割して繋ぐ。課題文は 1 分に収まる長さだが、
      // 読み直しで伸びることがある
      chunk_length_s: 30,
      stride_length_s: 5,
      // 出力を変えうる既定値はすべて明示的に渡す。既定に任せると、
      // ライブラリの版を上げた日に測定値が黙って動く(HC-050)
      return_timestamps: false,
      force_full_sequences: false,
      do_sample: false,
      num_beams: 1,
    });
    return {
      text: output.text.trim(),
      durationSec: input.audio.length / TARGET_RATE,
      engine: this.name,
    };
  }
}
