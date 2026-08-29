// T-040 / T-041 / T-043 / G-07 / G-08 — カタログの健全性
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRITERIA, PASSAGES, getPassage } from "../catalog";
import { normalize } from "../normalize";

/**
 * 生成元のコーパス。別プロジェクト(aozora-sakuin)の成果物なので、
 * 手元に無い環境ではこのファイルを使う検査だけを飛ばす。
 * カタログ自体はリポジトリに入っているので、他の検査はどこでも走る。
 */
const CORPUS = "C:/_ClaudeCode/aozora-sakuin/data/normalized";

/** 日本語本文に紛れると目視では気づけない文字(フリート共通規範) */
const CONFUSABLE = /[\u0400-\u04FF\u0370-\u03FF]/;

describe("catalog", () => {
  it("T-040 / G-07 全課題文が選定条件を満たす", () => {
    expect(PASSAGES.length).toBeGreaterThan(0);
    for (const p of PASSAGES) {
      expect(p.kana).toBe(CRITERIA.kana);
      expect(p.text.length).toBeGreaterThanOrEqual(CRITERIA.minChars);
      expect(p.text.length).toBeLessThanOrEqual(CRITERIA.maxChars);
      expect(normalize(p.text).text.length).toBeGreaterThan(0);
      // 出典が埋まっている
      expect(p.workId).toMatch(/^[0-9]{6}$/);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.author.length).toBeGreaterThan(0);
      expect(p.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("T-040b 本文も ID も重複しない", () => {
    const texts = new Set(PASSAGES.map((p) => p.text));
    const ids = new Set(PASSAGES.map((p) => p.id));
    expect(texts.size).toBe(PASSAGES.length);
    expect(ids.size).toBe(PASSAGES.length);
  });

  it("T-040c 著者は 1 人 1 作(偏りを避ける選定条件)", () => {
    expect(CRITERIA.onePerAuthor).toBe(true);
    const authors = new Set(PASSAGES.map((p) => p.author));
    expect(authors.size).toBe(PASSAGES.length);
  });

  it("getPassage は ID で引ける", () => {
    expect(getPassage(PASSAGES[0].id)).toEqual(PASSAGES[0]);
    expect(getPassage("存在しない")).toBeUndefined();
  });

  it("T-043 / G-08 キリル文字・ギリシャ文字が混入しない", () => {
    for (const p of PASSAGES) {
      expect(CONFUSABLE.test(p.text)).toBe(false);
      expect(CONFUSABLE.test(p.title)).toBe(false);
      expect(CONFUSABLE.test(p.author)).toBe(false);
    }
  });

  it.skipIf(!existsSync(CORPUS))(
    "T-041 本文が出典の当該位置と一致する(写経していないことの検査)",
    () => {
      // 期待値の出所: 青空文庫の正規化済み本文そのもの。
      // カタログはここから機械的に切り出されたので、
      // オフセットと指紋の両方が合わなければならない
      for (const p of PASSAGES) {
        const raw = readFileSync(`${CORPUS}/${p.workId}.txt`);
        const sha = createHash("sha256").update(raw).digest("hex");
        const record = p as unknown as { sourceSha256: string };
        expect(sha).toBe(record.sourceSha256);
        const text = raw.toString("utf8");
        expect(text.slice(p.offset, p.offset + p.text.length)).toBe(p.text);
      }
    },
  );
});
