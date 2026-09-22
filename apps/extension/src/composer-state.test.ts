import { describe, expect, it } from "vitest";

import { composerView, IDLE_COMPOSER_STATE, type ComposerState } from "./composer-state.js";

function state(overrides: Partial<ComposerState> = {}): ComposerState {
  return { ...IDLE_COMPOSER_STATE, ...overrides };
}

describe("composerView", () => {
  it("invites the reader to write when the box is empty", () => {
    const view = composerView(state(), { autoPreview: false });
    expect(view.canTranslate).toBe(false);
    expect(view.canApply).toBe(false);
    expect(view.preview).toContain("한국어");
  });

  it("offers a preview once there is a Korean draft", () => {
    const view = composerView(state({ draft: "저도 방금 깼어요" }), { autoPreview: false });
    expect(view.canTranslate).toBe(true);
    expect(view.shouldAutoTranslate).toBe(false);
  });

  it("asks for an automatic preview only when the reader turned it on", () => {
    const view = composerView(state({ draft: "저도 방금 깼어요" }), { autoPreview: true });
    expect(view.shouldAutoTranslate).toBe(true);
  });

  it("waits for the IME to finish before translating", () => {
    const view = composerView(state({ composing: true, draft: "저도 방금" }), {
      autoPreview: true,
    });
    expect(view.canTranslate).toBe(false);
    expect(view.shouldAutoTranslate).toBe(false);
    expect(view.preview).toContain("입력 중");
  });

  it("does not offer a preview for an English draft", () => {
    const view = composerView(state({ draft: "already english" }), { autoPreview: true });
    expect(view.canTranslate).toBe(false);
    expect(view.shouldAutoTranslate).toBe(false);
  });

  it("shows progress while the server is working", () => {
    const view = composerView(state({ draft: "저도 방금 깼어요", phase: "translating" }), {
      autoPreview: false,
    });
    expect(view.canApply).toBe(false);
    expect(view.preview).toContain("다듬고");
  });

  it("shows the English preview and allows applying it", () => {
    const view = composerView(
      state({
        draft: "저도 방금 깼어요",
        phase: "translated",
        result: "I just beat it too!",
        resultDraft: "저도 방금 깼어요",
      }),
      { autoPreview: false },
    );

    expect(view.preview).toBe("I just beat it too!");
    expect(view.canApply).toBe(true);
  });

  it("refuses to apply a preview of a draft the reader has since edited", () => {
    const view = composerView(
      state({
        draft: "저도 방금 깼어요 그리고 더 씀",
        phase: "translated",
        result: "I just beat it too!",
        resultDraft: "저도 방금 깼어요",
      }),
      { autoPreview: false },
    );

    expect(view.canApply).toBe(false);
  });

  it("offers to restore the Korean draft only while the applied English is intact", () => {
    const applied = state({
      applied: "I just beat it too!",
      draft: "I just beat it too!",
      phase: "translated",
      result: "I just beat it too!",
      resultDraft: "저도 방금 깼어요",
      saved: "저도 방금 깼어요",
    });
    expect(composerView(applied, { autoPreview: false }).canRestore).toBe(true);

    const edited = { ...applied, draft: "I just beat it too! and more" };
    expect(composerView(edited, { autoPreview: false }).canRestore).toBe(false);
  });

  it("shows why a preview failed instead of going quiet", () => {
    const view = composerView(
      state({
        draft: "저도 방금 깼어요",
        failure: "번역 서버에 연결하지 못했어요.",
        phase: "failed",
      }),
      { autoPreview: false },
    );

    expect(view.preview).toBe("번역 서버에 연결하지 못했어요.");
    expect(view.canApply).toBe(false);
    expect(view.canTranslate).toBe(true);
  });

  it("always reminds the reader that sending stays theirs", () => {
    expect(composerView(state({ draft: "저도 방금 깼어요" }), { autoPreview: false }).status).toContain(
      "직접",
    );
  });
});
