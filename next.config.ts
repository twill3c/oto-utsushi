import type { NextConfig } from "next";

// 静的エクスポート(N-01)— サーバ API を持たず、out/ のみで動作する。
// 推論はすべてブラウザ内で行うため Function 実行も ISR も発生しない。
// モデル重みは public/ に置かず Hugging Face の CDN から取る(N-03)。
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
