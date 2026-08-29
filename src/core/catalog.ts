// =====================================================================
// F-01 課題文カタログ
//
// 本文はコードに直接書かない。tools/select_passages.py が青空文庫の
// 正規化済み本文から機械的に選び、data/passages.json に固定したものを読む。
// **本文をここへ手で写すと、写し間違いがそのまま正解になる**(TEST_SPEC)。
// =====================================================================
import raw from "../../data/passages.json";
import type { Passage } from "./types";

interface CatalogFile {
  generator: string;
  source: string;
  criteria: {
    kana: string;
    minChars: number;
    maxChars: number;
    onePerAuthor: boolean;
    allowedPunct: string;
  };
  passages: Array<Passage & { sourceSha256: string }>;
}

const file = raw as CatalogFile;

/** 選定条件(G-07 の検査はこの値を参照する) */
export const CRITERIA = file.criteria;

/** 課題文の一覧 */
export const PASSAGES: readonly Passage[] = file.passages;

/** ID で引く */
export function getPassage(id: string): Passage | undefined {
  return PASSAGES.find((p) => p.id === id);
}
