"use client";

import { useMemo, useState } from "react";
import { PASSAGES } from "@/core/catalog";
import { measure } from "@/core/metrics";
import { normalize } from "@/core/normalize";
import type { EditOp } from "@/core/types";

/**
 * 原文の上に編集操作を描く。
 *
 * 操作は正規化後の列に対して出るが、`origIndex` で原文の位置へ戻せるので、
 * 句読点も改行も保ったまま原文そのものへ印を打てる。
 */
function Painted({ text, ops }: { text: string; ops: readonly EditOp[] }) {
  // 原文インデックス → その位置に付く印
  const marks = new Map<number, "sub" | "del">();
  // 原文インデックスの直前に挿入された文字
  const inserts = new Map<number, string>();

  const anchorEnd = text.length;
  for (const op of ops) {
    if (op.origIndex !== null && (op.kind === "sub" || op.kind === "delete")) {
      marks.set(op.origIndex, op.kind === "sub" ? "sub" : "del");
    }
  }
  // 挿入は「次に現れる参照文字の原文位置」の手前へ寄せる
  const anchorToOrig = new Map<number, number>();
  for (const op of ops) {
    if (op.refIndex !== null && op.origIndex !== null) {
      anchorToOrig.set(op.refIndex, op.origIndex);
    }
  }
  for (const op of ops) {
    if (op.kind !== "insert" || op.hypChar === null) continue;
    const at = anchorToOrig.get(op.refAnchor) ?? anchorEnd;
    inserts.set(at, (inserts.get(at) ?? "") + op.hypChar);
  }

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const added = inserts.get(i);
    if (added !== undefined) {
      nodes.push(
        <mark className="ins" key={`i${i}`} title="転写にだけ現れた文字">
          {added}
        </mark>,
      );
    }
    const kind = marks.get(i);
    nodes.push(
      kind === undefined ? (
        <span key={`c${i}`}>{text[i]}</span>
      ) : (
        <mark
          className={kind}
          key={`c${i}`}
          title={kind === "sub" ? "別の字として認識された" : "認識されなかった"}
        >
          {text[i]}
        </mark>
      ),
    );
  }
  const tail = inserts.get(anchorEnd);
  if (tail !== undefined) {
    nodes.push(
      <mark className="ins" key="tail">
        {tail}
      </mark>,
    );
  }
  return <>{nodes}</>;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default function Utsushi() {
  const [passageId, setPassageId] = useState(PASSAGES[0].id);
  const [hypothesis, setHypothesis] = useState("");

  const passage =
    PASSAGES.find((p) => p.id === passageId) ?? PASSAGES[0];

  const result = useMemo(
    () => (hypothesis.trim() === "" ? null : measure(passage.text, hypothesis)),
    [passage, hypothesis],
  );

  const refChars = normalize(passage.text).text.length;

  return (
    <>
      <h2>一 課題文をえらぶ</h2>
      <p className="lede">
        いずれも青空文庫の新字新仮名の作品から、機械的に選び出した一節。
        本文はコードに書き写しておらず、出典の当該位置と一致することを検査で固定している。
      </p>
      <select
        value={passageId}
        onChange={(e) => setPassageId(e.target.value)}
        aria-label="課題文"
      >
        {PASSAGES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.author}『{p.title}』
          </option>
        ))}
      </select>

      <div className="passage">
        {result === null ? (
          passage.text
        ) : (
          <Painted text={passage.text} ops={result.alignment.ops} />
        )}
        <div className="source">
          青空文庫 {passage.workId}／{passage.author}『{passage.title}』
          （{passage.kana}・{passage.text.length}字／正規化後 {refChars}字）
        </div>
      </div>

      <h2>二 聞こえたとおりに写す</h2>
      <p className="lede">
        いまは手で打ち込む。ここへ<strong>ブラウザ内の音声認識</strong>が
        書き込むようになるのが次の段で、比べ方はいま作ったものがそのまま使われる。
      </p>
      <textarea
        value={hypothesis}
        onChange={(e) => setHypothesis(e.target.value)}
        placeholder="認識結果、あるいは聞こえたとおりの文字列"
        aria-label="転写"
      />

      {result === null ? (
        <p className="note">
          文字を入れると、原文の上に差が描かれる。
          <br />
          原文は<strong>先に画面に在る</strong>ので、どこがどう違ったかを厳密に測れる —
          これがこのアプリの立っている土台で、だから認識器には原文を一切渡さない。
        </p>
      ) : (
        <>
          <h2>三 差を読む</h2>
          <dl className="numbers">
            <div>
              <dt>厳密 CER</dt>
              <dd>{percent(result.strictCER)}</dd>
            </div>
            <div>
              <dt>表記ゆれ許容 CER</dt>
              <dd>{percent(result.lenientCER)}</dd>
            </div>
            <div>
              <dt>置換 / 脱落 / 余分</dt>
              <dd>
                {result.breakdown.sub} / {result.breakdown.delete} /{" "}
                {result.breakdown.insert}
              </dd>
            </div>
            <div>
              <dt>読み飛ばし</dt>
              <dd>{result.skips.length}</dd>
            </div>
          </dl>
          <div className="legend">
            <span>
              <mark className="sub">別の字</mark>
            </span>
            <span>
              <mark className="del">読まれなかった</mark>
            </span>
            <span>
              <mark className="ins">余分</mark>
            </span>
          </div>

          {result.skips.length + result.restarts.length > 0 ? (
            <ul className="findings">
              {result.skips.map((s) => (
                <li key={`s${s.origStart}`}>
                  読み飛ばし {s.length} 字 — 「{s.text}」
                </li>
              ))}
              {result.restarts.map((r) => (
                <li key={`r${r.refAnchor}`}>
                  言い直し — 「{r.inserted}」のあとに読み直している
                </li>
              ))}
            </ul>
          ) : null}

          <p className="note">
            二つの CER は<strong>同じ分母</strong>(読むよう求めた文字数)で割ってある。
            表記ゆれ許容側は、読みを変えない変換(カタカナ→ひらがな・繰り返し記号の展開・
            位取りを含む漢数字)で説明できる差を一致に数え直したもの。
            <strong>許容側が厳密側より小さいとは限らない</strong> —
            繰り返し記号の展開は、直前の一字の誤りを二字ぶんに広げるため。
          </p>
        </>
      )}
    </>
  );
}
