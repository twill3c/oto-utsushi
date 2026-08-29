import type { Metadata } from "next";
import { FOOTER_LINKS } from "@/lib/links";
import "./globals.css";

export const metadata: Metadata = {
  title: "音写ラボ — 機械が聞き落とす場所を測る",
  description:
    "青空文庫の一節を音読し、ブラウザ内で完結する音声認識の出力を原文と突き合わせて、機械が聞き落とす場所を原文の上に描く。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {children}
        <footer>
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.href}>
              {i > 0 ? " ・ " : null}
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </footer>
      </body>
    </html>
  );
}
