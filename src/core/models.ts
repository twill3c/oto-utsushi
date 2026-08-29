// =====================================================================
// F-07 モデルレジストリ — 何をどれだけ落とすのかを先に言う
//
// ブラウザ内推論の代償は**初回のダウンロード**である。数十 MB を黙って
// 落とし始めるアプリにはしない。どの重みが何バイトかを実測して持ち、
// 押す前に見せる。
//
// 重みは Hugging Face の CDN から取る。リポジトリにも Vercel にも置かない
// (SPEC N-03)— そこに置くと無料枠を帯域で焼く。
//
// 実行系(WebGPU / WebAssembly)の選択もここで決める。純関数なので
// ブラウザが無くても検査できる。
// =====================================================================

/** 推論の実行系 */
export type Device = "webgpu" | "wasm";

/** transformers.js に渡す重みの型指定 */
export interface DtypeChoice {
  encoder_model: string;
  decoder_model_merged: string;
}

export interface ModelEntry {
  /** Hugging Face のリポジトリ ID */
  id: string;
  label: string;
  /** 実測したバイト数(device ごとに落ちるファイルが違う) */
  bytes: Record<Device, number>;
  note: string;
}

/**
 * 採用したモデル。
 *
 * バイト数の出所: Hugging Face の models API(`?blobs=true`)を 2026-08-29 に実測。
 * encoder と decoder_model_merged の 2 ファイルの合計で、
 * トークナイザ等の付随ファイル(数 MB)は含まない。
 * **dtypeFor() が返す型の実ファイルと対応している** — 型を変えたらここも測り直す。
 */
export const MODELS: readonly ModelEntry[] = [
  {
    id: "onnx-community/whisper-base",
    label: "whisper-base(既定)",
    // webgpu: encoder fp32 82,468,078 + decoder_merged q4   123,602,419
    // wasm:   encoder q8   23,201,314 + decoder_merged fp16 104,727,818
    bytes: { webgpu: 206_070_497, wasm: 127_929_132 },
    note: "日本語を実用的に拾える最小の段。まずこれで測る",
  },
  {
    id: "onnx-community/whisper-tiny",
    label: "whisper-tiny(軽い・粗い)",
    // webgpu: encoder fp32 32,904,992 + decoder_merged q4   86,713,702
    // wasm:   encoder q8   10,124,990 + decoder_merged fp16 59,593,896
    bytes: { webgpu: 119_618_694, wasm: 69_718_886 },
    note: "回線が細いとき用。日本語はかなり崩れるが、崩れ方を見るのも目的のうち",
  },
];

/**
 * 採らなかったモデルと、その理由。
 *
 * **測って捨てたものを消さない。** 次に同じ問いが来たとき、
 * 「調べたが駄目だった」と「調べていない」を取り違えないために残す。
 */
export const REJECTED: readonly { id: string; bytes: number; why: string }[] = [
  {
    id: "onnx-community/kotoba-whisper-v2.2-ONNX",
    bytes: 533_622_839, // encoder q4f16 369,947,724 + decoder_merged q4f16 163,675,115
    why:
      "日本語特化で精度は望ましいが、large-v3 蒸留なのでエンコーダが大きい。" +
      "最小の組み合わせ(q4f16)でも 534 MB あり、初回に落とさせる量ではない。" +
      "実測 2026-08-29",
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

/**
 * 実行系ごとの重みの型。
 *
 * WebGPU でもエンコーダは fp32 のままにする。fp16 のエンコーダには
 * 既知の精度問題があり(transformers.js issue #1590)、
 * **速さのために測定対象を歪めては本末転倒**だから。
 *
 * ■ WASM のデコーダを q8 にできない理由(loop_003 実ブラウザ実測)
 *
 * `decoder_model_merged` の **8 bit 系(q8 / int8 / uint8)が読み込めない**。
 * ONNX Runtime 1.26.0-dev の QDQ 最適化が落ちる:
 *
 *     qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
 *     Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
 *
 * エンコーダの q8 は通るので、これはデコーダ側だけの問題である。
 * 実測(whisper-tiny / wasm): q8 と int8 と uint8 が失敗、
 * fp16(11.9s)・bnb4(10.0s)・q4(10.3s)・fp32(19.7s)が成功。
 * 通るもののうち**最も小さい fp16** を採る。
 *
 * これは単体テストでもビルドでも成果物検査でも出ない。
 * **実ブラウザで動かして初めて出る故障**だった。
 * ライブラリか実行系の版を上げるときは、ここを実測し直すこと。
 */
export function dtypeFor(device: Device): DtypeChoice {
  if (device === "webgpu") {
    return { encoder_model: "fp32", decoder_model_merged: "q4" };
  }
  return { encoder_model: "q8", decoder_model_merged: "fp16" };
}

export function getModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}

/** 初回に落ちるおおよその量を人が読める形で */
export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * WASM が単スレッドへ退避しているか。
 *
 * onnxruntime-web は `crossOriginIsolated` でない環境では**黙って**
 * 単スレッドに落ちる(3〜4 倍遅い)。黙られると「こんなものか」と
 * 思われるだけなので、状態を取り出して画面に出す。
 *
 * このアプリは COOP/COEP を付けない。付けると `require-corp` が
 * Hugging Face の CDN からの取得を塞ぎ、`credentialless` の対応も
 * ブラウザによってまちまちで、**モデルが落ちてこない方が重い故障**になる。
 * 速さは WebGPU で取り、WASM は遅いと言った上で使う。
 */
export function threadingState(isolated: boolean, device: Device): string {
  if (device === "webgpu") return "WebGPU";
  return isolated ? "WebAssembly(複数スレッド)" : "WebAssembly(単スレッド・遅い)";
}
