import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    // tsconfig の paths("@/*" → "./src/*")を vitest にも適用する
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      // types.ts / recognizer.ts は型定義のみ(実行文ゼロ)。v8 が 0% として
      // 集計する既知のアーティファクトのため対象外 — 実コードの除外ではない
      exclude: [
        "src/core/__tests__/**",
        "src/core/types.ts",
        "src/core/recognizer.ts",
      ],
      // SPEC N-02: src/core は lines/functions/statements >= 90%, branches >= 85%
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
