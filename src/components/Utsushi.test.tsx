// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PASSAGES } from "@/core/catalog";
import Utsushi from "./Utsushi";

// vitest は globals を有効にしていないので、RTL の自動 cleanup が
// 登録されない。明示的に外さないと前のテストの DOM が残り、
// getBy* が「複数見つかった」で落ちる
afterEach(cleanup);

describe("Utsushi", () => {
  it("課題文が全件えらべる", () => {
    render(<Utsushi />);
    const select = screen.getByLabelText("課題文") as HTMLSelectElement;
    expect(select.options).toHaveLength(PASSAGES.length);
  });

  it("転写が空のあいだは数を出さない", () => {
    render(<Utsushi />);
    expect(screen.queryByText("厳密 CER")).toBeNull();
    expect(screen.getByText(/原文の上に差が描かれる/)).toBeTruthy();
  });

  it("原文をそのまま写すと厳密 CER が 0.0% になる", async () => {
    const user = userEvent.setup();
    render(<Utsushi />);
    await user.click(screen.getByLabelText("転写"));
    await user.paste(PASSAGES[0].text);
    expect(screen.getByText("厳密 CER")).toBeTruthy();
    // 数のタイルは「厳密 CER」→「0.0%」の順で並ぶ
    const tiles = screen.getAllByText("0.0%");
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("違う文字を写すと原文の上に印が出る", async () => {
    const user = userEvent.setup();
    const { container } = render(<Utsushi />);
    await user.click(screen.getByLabelText("転写"));
    await user.paste("まったくちがうもじれつ");
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);
  });
});
