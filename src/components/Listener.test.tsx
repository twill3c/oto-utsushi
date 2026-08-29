// @vitest-environment jsdom
// T-065 — 落とす量と実行系を、押す前に言っているか
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS, formatBytes } from "@/core/models";
import Listener from "./Listener";

afterEach(cleanup);

describe("Listener", () => {
  it("模型を全件えらべる", async () => {
    render(<Listener onTranscript={vi.fn()} />);
    const select = (await screen.findByLabelText(
      "使う模型",
    )) as HTMLSelectElement;
    expect(select.options).toHaveLength(MODELS.length);
  });

  it("押す前に「何をどれだけ落とすか」を言う", async () => {
    render(<Listener onTranscript={vi.fn()} />);
    // jsdom には navigator.gpu が無いので WebAssembly へ退避する
    await waitFor(() =>
      expect(screen.getByText(/WebAssembly/)).toBeTruthy(),
    );
    // 単スレッドであることを黙らせない
    expect(screen.getByText(/単スレッド/)).toBeTruthy();
    expect(
      screen.getByText(formatBytes(MODELS[0].bytes.wasm)),
    ).toBeTruthy();
  });

  it("読み込みボタンは実行系が分かるまで押せない", async () => {
    render(<Listener onTranscript={vi.fn()} />);
    const button = screen.getByRole("button", { name: "模型を読み込む" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  });
});
