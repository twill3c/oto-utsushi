"""G-01 の照合ケースを生成する。

Python 側の独立実装(align_ref.py)で距離と操作内訳を求め、
`data/cases/align_cases.json` へ書き出す。TypeScript のテストはこの
ファイルを読んで自分の結果と突き合わせる。

**TS から Python を起動しない。** 片方が片方を呼ぶ形にすると、
呼ばれた側の失敗が呼んだ側の失敗として現れ、失敗の帰属が壊れる
(TEST_SPEC「実行規約」)。

    python tools/gen_cases.py
"""

from __future__ import annotations

import json
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from align_ref import align, counts  # noqa: E402

SEED = 20260829
N_CASES = 1000

# 日本語の音読で実際に現れる文字種を混ぜる。かなだけだと一致が多くなりすぎ、
# 漢字だけだと置換ばかりになる。数字は表記ゆれ経路の素材でもある。
ALPHABET = list("あいうえおかきくけこさしすせそたちつてと")
ALPHABET += list("アイウエオカキクケコ")
ALPHABET += list("山川人海空日月花鳥風雪")
ALPHABET += list("0123456789")

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "cases"


def random_string(rng: random.Random, lo: int, hi: int) -> str:
    length = rng.randint(lo, hi)
    return "".join(rng.choice(ALPHABET) for _ in range(length))


def mutate(rng: random.Random, src: str) -> str:
    """参照から少しずれた転写を作る。実際の認識誤りに近い分布にする。"""
    chars = list(src)
    n_edits = rng.randint(0, max(1, len(chars) // 3))
    for _ in range(n_edits):
        if not chars:
            chars.append(rng.choice(ALPHABET))
            continue
        kind = rng.choice(["sub", "insert", "delete"])
        pos = rng.randrange(len(chars))
        if kind == "sub":
            chars[pos] = rng.choice(ALPHABET)
        elif kind == "insert":
            chars.insert(pos, rng.choice(ALPHABET))
        else:
            chars.pop(pos)
    return "".join(chars)


def build_cases() -> list[dict]:
    rng = random.Random(SEED)
    cases: list[dict] = []

    # 境界のケースを先に固定で入れる(乱択に任せると出ないことがある)
    fixed = [
        ("", ""),
        ("", "あいう"),
        ("あいう", ""),
        ("あいう", "あいう"),
        ("ab", "ba"),  # 同点の割り方が効くケース
        ("あ", "い"),
    ]
    for ref, hyp in fixed:
        cases.append({"ref": ref, "hyp": hyp})

    while len(cases) < N_CASES:
        ref = random_string(rng, 1, 40)
        # 半分は参照から変異させ、半分は無関係な文字列にする
        hyp = mutate(rng, ref) if rng.random() < 0.5 else random_string(rng, 0, 40)
        cases.append({"ref": ref, "hyp": hyp})

    for case in cases:
        result = align(case["ref"], case["hyp"])
        case["distance"] = result["distance"]
        case["counts"] = counts(result["ops"])
    return cases


def main() -> None:
    cases = build_cases()
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "align_cases.json"
    payload = {
        "generator": "tools/gen_cases.py",
        "implementation": "tools/align_ref.py(全表 DP + 逆走査)",
        "seed": SEED,
        "tie_break": "斜め > 削除 > 挿入(SPEC F-03)",
        "cases": cases,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"{path} — {len(cases)} ケース")


if __name__ == "__main__":
    main()
