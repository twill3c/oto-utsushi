// =====================================================================
// 音写ラボ — コアの型
//
// 参照テキスト(課題文)と認識結果は**別の型**である。両者を混ぜないことが
// このプロジェクトの測定を成り立たせている(SPEC N-06 / G-03)。
// =====================================================================

/**
 * 課題文(参照テキスト)。青空文庫の一節をそのまま持つ。
 *
 * **この型の値を認識器へ渡してはならない。** 認識器の入力型
 * ({@link ./recognizer.RecognitionInput})は意図的にテキストを受け取らない。
 */
export interface Passage {
  /** 課題文 ID(`p001` 形式) */
  id: string;
  /** 青空文庫の作品 ID(6 桁ゼロ埋め) */
  workId: string;
  title: string;
  author: string;
  /** 表記(このプロジェクトは「新字新仮名」のみ採る — SPEC N-07 / G-07) */
  kana: string;
  /** 出典本文中の開始オフセット(文字単位) */
  offset: number;
  /** 本文(原文のまま。正規化前) */
  text: string;
}

/** 正規化の結果。原文位置を失わないための写像を伴う(SPEC F-02 / G-05) */
export interface Normalized {
  /** 正規化後の文字列 */
  text: string;
  /**
   * `text` の i 番目の**コードポイント**が原文のどのインデックス由来かを表す。
   * 長さは `Array.from(text).length` に等しく、値は単調非減少で
   * 原文の有効範囲内(G-05)。索引がコードポイント単位なのは、
   * アライメントがサロゲートペアの漢字を割らないようにするため。
   */
  origIndex: number[];
}

/** 編集操作の種類 */
export type OpKind = "equal" | "sub" | "insert" | "delete";

/**
 * 編集操作 1 件。
 *
 * 位置はすべて**正規化後**の列に対するインデックスで、`origIndex` だけが
 * 原文の位置を指す。UI が原文の上に印を打てるのはこの逆写像による。
 */
export interface EditOp {
  kind: OpKind;
  /** 正規化参照列の位置。`insert` では null */
  refIndex: number | null;
  /** 正規化転写列の位置。`delete` では null */
  hypIndex: number | null;
  /**
   * 参照列上の錨。`equal`/`sub`/`delete` では `refIndex` に等しく、
   * `insert` では「この位置の直前に挿入された」を意味する(0..refLen)
   */
  refAnchor: number;
  /** 原文中の位置。参照側を持たない `insert` では null */
  origIndex: number | null;
  refChar: string | null;
  hypChar: string | null;
}

/** アライメントの結果 */
export interface Alignment {
  /** 編集距離(挿入/削除/置換をそれぞれコスト 1 とする) */
  distance: number;
  ops: EditOp[];
  refLength: number;
  hypLength: number;
}

/** 読み飛ばし(連続削除) */
export interface Skip {
  /** 原文中の開始位置 */
  origStart: number;
  /** 原文中の終了位置(この位置は含まない) */
  origEnd: number;
  /** 飛ばされた正規化参照列の文字数 */
  length: number;
  /** 飛ばされた原文の断片 */
  text: string;
}

/** 言い直し(挿入の直後に同じ内容が読み直されている形) */
export interface Restart {
  /** 挿入が起きた参照列上の錨 */
  refAnchor: number;
  /** 原文中の位置 */
  origIndex: number;
  /** 挿入された断片(言い直しの一回目) */
  inserted: string;
  /** 直後に続く参照側の断片(言い直しの二回目) */
  repeated: string;
  /** 二つの断片の編集距離 */
  distance: number;
}

/** 計量の結果(SPEC F-04) */
export interface Measurement {
  /** 正規化後の字面で測った文字誤り率。参照が空なら null */
  strictCER: number | null;
  /** 表記ゆれ辞書で説明できる差を一致に数え直した文字誤り率。参照が空なら null */
  lenientCER: number | null;
  breakdown: { equal: number; sub: number; insert: number; delete: number };
  skips: Skip[];
  restarts: Restart[];
  /** 読速(認識された文字数 / 秒)。継続時間が 0 以下なら null */
  charsPerSecond: number | null;
  alignment: Alignment;
}
