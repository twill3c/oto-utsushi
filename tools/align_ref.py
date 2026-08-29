"""G-01 二実装照合の相手側 — Levenshtein の独立実装。

TypeScript 側(src/core/align.ts)を参照せずに書く。**同じ疑似コードを
二言語へ写しただけでは照合にならない**(TEST_SPEC「オラクルの出所」)ため、
実装戦略を意図的に変えてある:

    TS 側   … コストは 2 行ローリング + 方向表を別に持って復元する
    Python  … 全表を持ち、方向は保存せず**逆走査で推定して**戻る

距離は実装に依らないが、最小コストの操作列は一意ではない。同点の割り方は
仕様として固定されている(SPEC F-03 / align.ts の冒頭):

    1. 斜め(equal / sub)  2. 削除  3. 挿入

逆走査は同じ優先順位で「その手前に到達しうるか」を試すので、
前向きの選択と一致する — 前向きが選ぶのは最小を達成する最初の手であり、
逆走査が選ぶのも最小を達成する最初の手だからである。

標準ライブラリのみを使う。
"""

from __future__ import annotations

EQUAL = "equal"
SUB = "sub"
INSERT = "insert"
DELETE = "delete"


def distance_table(ref: str, hyp: str) -> list[list[int]]:
    """全表 DP。d[i][j] = ref[:i] と hyp[:j] の編集距離。"""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
    for j in range(1, m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j - 1] + cost,  # 斜め
                d[i - 1][j] + 1,  # 削除
                d[i][j - 1] + 1,  # 挿入
            )
    return d


def align(ref: str, hyp: str) -> dict:
    """距離と操作列を返す。操作列は前から後ろの順。"""
    d = distance_table(ref, hyp)
    i, j = len(ref), len(hyp)
    ops: list[dict] = []
    while i > 0 or j > 0:
        # 優先順位どおりに「そこから来られるか」を試す
        if i > 0 and j > 0:
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            if d[i][j] == d[i - 1][j - 1] + cost:
                ops.append(
                    {
                        "kind": EQUAL if cost == 0 else SUB,
                        "refIndex": i - 1,
                        "hypIndex": j - 1,
                        "refChar": ref[i - 1],
                        "hypChar": hyp[j - 1],
                    }
                )
                i -= 1
                j -= 1
                continue
        if i > 0 and d[i][j] == d[i - 1][j] + 1:
            ops.append(
                {
                    "kind": DELETE,
                    "refIndex": i - 1,
                    "hypIndex": None,
                    "refChar": ref[i - 1],
                    "hypChar": None,
                }
            )
            i -= 1
            continue
        ops.append(
            {
                "kind": INSERT,
                "refIndex": None,
                "hypIndex": j - 1,
                "refChar": None,
                "hypChar": hyp[j - 1],
            }
        )
        j -= 1
    ops.reverse()
    return {
        "distance": d[len(ref)][len(hyp)],
        "ops": ops,
        "refLength": len(ref),
        "hypLength": len(hyp),
    }


def counts(ops: list[dict]) -> dict:
    c = {EQUAL: 0, SUB: 0, INSERT: 0, DELETE: 0}
    for op in ops:
        c[op["kind"]] += 1
    return c
