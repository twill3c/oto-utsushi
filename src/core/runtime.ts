// =====================================================================
// 実行系(ONNX Runtime Web)の取得先を、こちらで決める
//
// ■ なぜ既定に任せないか
//
// transformers.js は `wasmPaths` が未設定なら jsDelivr を指すが、
// その分岐は**ブラウザで割れる** — Safari には非 asyncify 版、
// それ以外には asyncify 版を割り当てる。どちらを取ったかは画面に出ない。
// 一方で webpack は asyncify 版だけを自オリジンへ複製するので、
// 「Safari だけ第三者 CDN から取る」という状態が黙って成立する。
//
// 既定に任せた結果が環境で変わるものは、**こちらで固定する**(HC-050)。
//
// ■ なぜ自オリジンに置かないか
//
// asyncify 版は実測 23.6 MB、非 asyncify 版は 12.9 MB ある。
// SPEC N-03 は「大きな binary を Vercel に置かない」と定めており、
// これは重みと同じ種類の物である。100 GB/月 の無料枠に対し
// 23.6 MB × 4,200 回で焼き切れる。**モデル本体(77 MB〜)を
// Hugging Face の CDN から取るのと同じ理由で、実行系も CDN から取る。**
//
// 音声も認識結果もここを通らない(取りに行くのは実行系の binary だけ)。
// =====================================================================

/**
 * 実行系の版。**範囲指定にしない。**
 *
 * 権威はライブラリではなく**その版の挙動**である(HC-050)。
 * `node_modules/onnxruntime-web/package.json` の version を実測して写す。
 * 依存を上げたときはこの定数も上げ、ゲートの再較正を別コミットで行う。
 * 実測 2026-08-29(@huggingface/transformers 4.2.0 が連れてくる版)。
 */
export const ORT_VERSION = "1.26.0-dev.20260416-b7804b056c";

const BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

/**
 * 取得先を明示的に組み立てる。
 *
 * `mjs` と `wasm` を**両方**指定する。片方だけ指定すると、
 * 残りがライブラリ既定のブラウザ分岐へ落ちて元の木阿弥になる。
 *
 * Safari だけ非 asyncify 版を使うのは**ライブラリと同じ割り当て**である。
 * ここで揃えたいのは「取得先と版を自分で決めること」であって、
 * 検証されている組み合わせを勝手に変えることではない。
 * asyncify 版を全ブラウザへ押し付ければ一様にはなるが、
 * Safari で試せない以上、**一様さのために未検証の組み合わせを選ばない**。
 */
export function wasmPaths(isSafari: boolean): { mjs: string; wasm: string } {
  const stem = isSafari
    ? "ort-wasm-simd-threaded"
    : "ort-wasm-simd-threaded.asyncify";
  return { mjs: `${BASE}${stem}.mjs`, wasm: `${BASE}${stem}.wasm` };
}

/**
 * Safari かどうか。Chrome/Edge の UA も "Safari" を含むので、
 * それらを除いてから判定する。
 */
export function isSafariUA(userAgent: string): boolean {
  if (!userAgent.includes("Safari")) return false;
  return !/Chrom(e|ium)|Edg\//.test(userAgent);
}
