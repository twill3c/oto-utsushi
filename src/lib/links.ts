// フッタリンク(F-08)。フリート共通規約は 5 項目だが、
// 「歩き方」「設計図」のアーティファクトは loop_002 で作って足す。
// **存在しない URL を先に置かない** — 切れたリンクはフッタの信用を落とす。

export interface FooterLink {
  label: string;
  href: string;
}

export const REPO_URL = "https://github.com/twill3c/oto-utsushi";

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "MIT License © 2026 坂田哲朗", href: `${REPO_URL}/blob/main/LICENSE` },
  { label: "GitHub", href: REPO_URL },
  { label: "App Menu", href: "https://app-menu-amber.vercel.app" },
] as const;
