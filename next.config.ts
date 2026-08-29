import type { NextConfig } from "next";

// 静的エクスポート(N-01)— サーバ API を持たず、out/ のみで動作する。
// 推論はすべてブラウザ内で行うため Function 実行も ISR も発生しない。
const nextConfig: NextConfig = {
  output: "export",
  webpack: (config) => {
    // ONNX Runtime の wasm を成果物へ載せない(N-08)。
    //
    // webpack は onnxruntime-web が持つ `new URL(....wasm)` を見て
    // 23.6 MB を out/_next/static/media へ複製する。実行系の取得先は
    // src/core/runtime.ts が CDN へ明示的に向けているので、この複製は
    // **一度も読まれない死荷重**でしかない(実測 2026-08-29: 成果物
    // 25.0 MB のうち 23.6 MB がこれだった)。重みと同じ理由(SPEC N-03)で、
    // 大きな binary は Vercel に置かない。
    //
    // `emit: false` は URL の解決だけ残してファイルを出さない。
    // 出さない URL が読まれたら 404 になるので、
    // **wasmPaths を明示している**ことがこの設定の前提である。
    // scripts/check_bundle.mjs がその名指しを対で検査する。
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
      generator: { emit: false },
    });
    return config;
  },
};

export default nextConfig;
