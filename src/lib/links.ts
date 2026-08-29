// フッタリンク(F-08)。フリート共通規約の 5 項目・この並び。
// 「読み方」「設計図」はアーティファクト(閲覧には共有設定が要る)。

export interface FooterLink {
  label: string;
  href: string;
}

export const REPO_URL = "https://github.com/twill3c/oto-utsushi";

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "MIT License © 2026 坂田哲朗", href: `${REPO_URL}/blob/main/LICENSE` },
  { label: "GitHub", href: REPO_URL },
  {
    label: "音写ラボの読み方",
    href: "https://claude.ai/code/artifact/bf5b62b0-7f9f-462a-a434-6a58236d9acd",
  },
  {
    label: "音写ラボ 設計図",
    href: "https://claude.ai/code/artifact/6356d86e-a9f8-4067-b30b-d69b58f40954",
  },
  { label: "App Menu", href: "https://app-menu-amber.vercel.app" },
] as const;
