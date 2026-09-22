import { isKoreanDraft } from "./language.js";

export type ComposerPhase = "failed" | "idle" | "translated" | "translating";

export interface ComposerState {
  /** The English text this extension last wrote into the editor. */
  readonly applied: string | null;
  /** True while an IME is still assembling a syllable. */
  readonly composing: boolean;
  readonly draft: string;
  readonly failure: string | null;
  readonly phase: ComposerPhase;
  readonly result: string | null;
  /** The draft the current result was produced from, used to spot stale previews. */
  readonly resultDraft: string | null;
  /** The Korean draft kept so the reader can undo an applied translation. */
  readonly saved: string | null;
}

export const IDLE_COMPOSER_STATE: ComposerState = {
  applied: null,
  composing: false,
  draft: "",
  failure: null,
  phase: "idle",
  result: null,
  resultDraft: null,
  saved: null,
};

export const COMPOSER_STATUS = "영어를 확인하고 직접 전송해요";

export interface ComposerViewOptions {
  readonly autoPreview: boolean;
}

export interface ComposerView {
  readonly canApply: boolean;
  readonly canRestore: boolean;
  readonly canTranslate: boolean;
  readonly preview: string;
  readonly shouldAutoTranslate: boolean;
  readonly status: string;
}

export function composerView(
  state: ComposerState,
  { autoPreview }: ComposerViewOptions,
): ComposerView {
  const korean = isKoreanDraft(state.draft);
  const canTranslate = korean && !state.composing && state.phase !== "translating";
  const isFresh = state.result !== null && state.resultDraft === state.draft;

  return {
    canApply: isFresh && !state.composing && state.phase === "translated",
    // Restoring only makes sense while the editor still holds exactly what this
    // extension wrote; once the reader edits it, undo is theirs to do.
    canRestore: state.saved !== null && state.applied !== null && state.applied === state.draft,
    canTranslate,
    preview: previewText(state, korean, isFresh),
    shouldAutoTranslate: autoPreview && canTranslate && state.phase === "idle",
    status: COMPOSER_STATUS,
  };
}

function previewText(state: ComposerState, korean: boolean, isFresh: boolean): string {
  if (state.composing) return "한국어 입력 중…";
  if (state.phase === "translating") return "영어로 다듬고 있어요…";
  if (state.phase === "failed" && state.failure !== null) return state.failure;
  if (state.phase === "translated" && isFresh && state.result !== null) return state.result;
  return korean ? "영어로 어떻게 들릴지 확인해 보세요." : "한국어로 편하게 써 보세요.";
}
