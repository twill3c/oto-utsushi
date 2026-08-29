"""F-01 課題文の選定パイプライン。

青空文庫 5,000 作の正規化済み本文(aozora-sakuin プロジェクトの成果物)から、
**音読できる新字新仮名の一節**を機械的に選び出して data/passages.json に固定する。

選定は決定論的である — 乱数を使わず、作品 ID の昇順に走査して条件を満たす
最初の一節を採る。同じコーパスに対して何度走らせても同じ結果になる。

    python tools/select_passages.py

コーパスが手元に無い環境では走らない(生成物の data/passages.json は
リポジトリに入っているので、テストとアプリはコーパス無しで動く)。
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

CORPUS = pathlib.Path("C:/_ClaudeCode/aozora-sakuin/data")
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "passages.json"

# 課題文の長さ(文字)。短すぎると認識の癖が出ず、長すぎると一息で読めない
MIN_CHARS = 80
MAX_CHARS = 160

N_PASSAGES = 24

# 音読の課題文に許す文字。ここに無い文字が 1 つでもあれば採らない。
#   - ASCII の英数字は除く(認識器が英語として出し、比較が別問題になる)
#   - 外字や注記の記号が残っていれば弾かれる
ALLOWED_PUNCT = set("、。「」『』（）〔〕・！？…‥―ー々ゝゞ")


def utf16_len(s: str) -> int:
    """UTF-16 コード単位での長さ。JavaScript の String.length と一致する。"""
    return len(s.encode("utf-16-le")) // 2


def is_kana(ch: str) -> bool:
    code = ord(ch)
    return 0x3041 <= code <= 0x309F or 0x30A1 <= code <= 0x30FA


def is_kanji(ch: str) -> bool:
    code = ord(ch)
    return 0x4E00 <= code <= 0x9FFF or 0x3005 <= code <= 0x3006


def is_allowed(ch: str) -> bool:
    return is_kana(ch) or is_kanji(ch) or ch in ALLOWED_PUNCT


def split_sentences(text: str) -> list[tuple[int, str]]:
    """本文を文へ切る。返り値は (開始オフセット, 文)。

    `。` で切り、直後に閉じ括弧が続く場合はそれも同じ文に含める。
    """
    out: list[tuple[int, str]] = []
    start = 0
    i = 0
    while i < len(text):
        if text[i] == "。":
            end = i + 1
            while end < len(text) and text[end] in "」』）":
                end += 1
            out.append((start, text[start:end]))
            start = end
            i = end
            continue
        i += 1
    return out


def find_passage(text: str) -> tuple[int, str] | None:
    """条件を満たす最初の一節を返す。無ければ None。"""
    sentences = split_sentences(text)
    for i in range(len(sentences)):
        offset, acc = sentences[i]
        if not acc.strip():
            continue
        j = i
        while len(acc) < MIN_CHARS and j + 1 < len(sentences):
            j += 1
            acc += sentences[j][1]
        acc = acc.strip()
        if not (MIN_CHARS <= len(acc) <= MAX_CHARS):
            continue
        if not acc.endswith(("。", "」", "』", "）")):
            continue
        if not all(is_allowed(ch) for ch in acc):
            continue
        # strip した分だけ開始位置がずれるので実位置を取り直す
        real = text.index(acc, offset)
        return real, acc
    return None


def main() -> None:
    if not CORPUS.exists():
        print(f"コーパスが見つからない: {CORPUS}", file=sys.stderr)
        raise SystemExit(1)

    works = json.loads((CORPUS / "works.json").read_text(encoding="utf-8"))["works"]
    modern = sorted(
        (w for w in works if w["kana"] == "新字新仮名"), key=lambda w: w["id"]
    )

    passages: list[dict] = []
    seen_authors: set[str] = set()
    seen_texts: set[str] = set()

    for work in modern:
        if len(passages) >= N_PASSAGES:
            break
        if work["author"] in seen_authors:
            continue
        path = CORPUS / "normalized" / f"{work['id']}.txt"
        if not path.exists():
            continue
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        found = find_passage(text)
        if found is None:
            continue
        offset, passage = found
        if passage in seen_texts:
            continue
        assert text[offset : offset + len(passage)] == passage, work["id"]
        # JavaScript の String は UTF-16 コード単位で索引する。BMP 外の漢字が
        # 手前に 1 つでもあると Python のコードポイント索引とずれるので、
        # 書き出す位置と長さは UTF-16 単位へ直す
        offset16 = utf16_len(text[:offset])
        length16 = utf16_len(passage)
        seen_authors.add(work["author"])
        seen_texts.add(passage)
        passages.append(
            {
                "id": f"p{len(passages) + 1:03d}",
                "workId": work["id"],
                "title": work["title"],
                "author": work["author"],
                "kana": work["kana"],
                "offset": offset16,
                "chars": length16,
                "text": passage,
                # T-041: 本文を写経していないことを後から検算するための指紋
                "sourceSha256": hashlib.sha256(raw).hexdigest(),
            }
        )

    payload = {
        "generator": "tools/select_passages.py",
        "source": "青空文庫(aozora-sakuin/data/normalized の正規化済み本文)",
        "criteria": {
            "kana": "新字新仮名",
            "minChars": MIN_CHARS,
            "maxChars": MAX_CHARS,
            "onePerAuthor": True,
            "allowedPunct": "".join(sorted(ALLOWED_PUNCT)),
        },
        "passages": passages,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT} — {len(passages)} 件")
    for p in passages:
        print(f"  {p['id']} {p['author']}『{p['title']}』{len(p['text'])}字")


if __name__ == "__main__":
    main()
