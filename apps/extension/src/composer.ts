import type { components } from "@community-translator/contracts";

import { composerView, IDLE_COMPOSER_STATE, type ComposerState } from "./composer-state.js";
import { mountShadowHost, prefersDark, readEditorText } from "./dom.js";
import { writeEditorText } from "./editor-write.js";
import { CARD_STYLES } from "./styles.js";

type TranslationTone = components["schemas"]["TranslationTone"];

/** How long the reader has to stop typing before an automatic preview starts. */
const AUTO_PREVIEW_DELAY_MS = 900;

export interface ComposerHost {
  getSettings(): { autoPreview: boolean; tone: TranslationTone };
  setTone(tone: TranslationTone): void;
  translate(text: string, tone: TranslationTone): Promise<string>;
}

export interface ComposerController {
  readonly element: HTMLElement;
  destroy(): void;
  refresh(): void;
}

const MARKUP = `
<style>${CARD_STYLES}</style>
<section class="card" aria-label="영어 미리보기">
  <div class="head">
    <span class="brand"><b>번역</b> 영어 미리보기 <span class="dot"></span> KO → EN</span>
    <label>말투
      <select aria-label="번역 말투">
        <option value="casual">친근하게</option>
        <option value="neutral">담백하게</option>
      </select>
    </label>
  </div>
  <p class="result waiting" aria-live="polite"></p>
  <div class="footer">
    <span class="status" aria-live="polite"></span>
    <div class="actions">
      <button type="button" class="restore" hidden>한국어 복원</button>
      <button type="button" class="copy" hidden>복사</button>
      <button type="button" class="translate">번역하기</button>
      <button type="button" class="apply primary" disabled>영어로 바꾸기</button>
    </div>
  </div>
</section>
`;

export function mountComposerCard(
  editor: Element,
  anchor: Element,
  host: ComposerHost,
): ComposerController {
  const mounted = mountShadowHost(anchor, "beforebegin", MARKUP);
  if (prefersDark(anchor)) {
    mounted.host.setAttribute("data-dark", "");
  }

  const find = <T extends Element>(selector: string): T => {
    const element = mounted.shadow.querySelector<T>(selector);
    if (!element) throw new Error(`Composer markup is missing ${selector}`);
    return element;
  };

  const toneSelect = find<HTMLSelectElement>("select");
  const result = find<HTMLParagraphElement>(".result");
  const status = find<HTMLSpanElement>(".status");
  const applyButton = find<HTMLButtonElement>(".apply");
  const copyButton = find<HTMLButtonElement>(".copy");
  const restoreButton = find<HTMLButtonElement>(".restore");
  const translateButton = find<HTMLButtonElement>(".translate");

  let state: ComposerState = { ...IDLE_COMPOSER_STATE, draft: readEditorText(editor) };
  let generation = 0;
  let writing = false;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let statusOverride: string | null = null;

  toneSelect.value = host.getSettings().tone;

  function render(): void {
    const settings = host.getSettings();
    const view = composerView(state, { autoPreview: settings.autoPreview });

    result.textContent = view.preview;
    result.classList.toggle("waiting", state.phase !== "translated" || !view.canApply);
    status.textContent = statusOverride ?? view.status;
    applyButton.disabled = !view.canApply;
    copyButton.hidden = !view.canApply;
    restoreButton.hidden = !view.canRestore;
    translateButton.disabled = !view.canTranslate;

    clearTimeout(autoTimer);
    if (view.shouldAutoTranslate) {
      autoTimer = setTimeout(() => void translate(), AUTO_PREVIEW_DELAY_MS);
    }
  }

  function update(): void {
    if (writing) return;
    const draft = readEditorText(editor);
    if (draft === state.draft) {
      render();
      return;
    }
    generation += 1;
    statusOverride = null;
    state = { ...state, draft, failure: null, phase: "idle" };
    render();
  }

  async function translate(): Promise<void> {
    clearTimeout(autoTimer);
    const settings = host.getSettings();
    const draft = readEditorText(editor);
    if (!composerView({ ...state, draft }, settings).canTranslate) return;

    const token = ++generation;
    statusOverride = null;
    state = { ...state, draft, failure: null, phase: "translating" };
    render();

    try {
      const english = await host.translate(draft, toneSelect.value as TranslationTone);
      if (token !== generation || !editor.isConnected) return;
      state = { ...state, phase: "translated", result: english, resultDraft: draft };
    } catch (error) {
      if (token !== generation || !editor.isConnected) return;
      state = {
        ...state,
        failure: error instanceof Error ? error.message : "번역에 실패했어요.",
        phase: "failed",
      };
    }
    render();
  }

  async function apply(): Promise<void> {
    if (writing || state.result === null) return;
    const english = state.result;
    const korean = state.draft;
    const token = generation;

    writing = true;
    try {
      const written = await writeEditorText(editor, english, {
        stillValid: () => token === generation && editor.isConnected,
      });
      if (!written) {
        statusOverride = "이 입력창은 직접 적용이 어려워요. 복사해서 붙여 넣어 주세요.";
        render();
        return;
      }
      state = { ...state, applied: english, draft: readEditorText(editor), saved: korean };
      statusOverride = "영어 적용 완료 · 전송은 작성창에서 직접 해 주세요";
    } finally {
      writing = false;
    }
    render();
  }

  async function restore(): Promise<void> {
    if (writing || state.saved === null) return;
    const korean = state.saved;
    const token = generation;

    writing = true;
    try {
      const written = await writeEditorText(editor, korean, {
        stillValid: () => token === generation && editor.isConnected,
      });
      if (!written) {
        statusOverride = "복원할 수 없어요. 실행 취소를 사용해 주세요.";
        render();
        return;
      }
      state = { ...state, applied: null, draft: readEditorText(editor), saved: null };
      statusOverride = null;
    } finally {
      writing = false;
    }
    render();
  }

  translateButton.addEventListener("click", () => void translate());
  applyButton.addEventListener("click", () => void apply());
  restoreButton.addEventListener("click", () => void restore());
  copyButton.addEventListener("click", () => {
    if (state.result === null) return;
    navigator.clipboard.writeText(state.result).then(
      () => {
        statusOverride = "영어를 복사했어요";
        render();
      },
      () => {
        statusOverride = "복사 권한이 없어요. 미리보기의 문장을 선택해 복사해 주세요.";
        render();
      },
    );
  });
  toneSelect.addEventListener("change", () => {
    host.setTone(toneSelect.value as TranslationTone);
    update();
  });

  const onCompositionStart = () => {
    state = { ...state, composing: true };
    render();
  };
  const onCompositionEnd = () => {
    state = { ...state, composing: false };
    update();
  };
  const onInput = () => update();

  editor.addEventListener("input", onInput, true);
  editor.addEventListener("compositionstart", onCompositionStart);
  editor.addEventListener("compositionend", onCompositionEnd);

  // Some editors mutate their DOM without firing input, so the model is also
  // re-read whenever the subtree changes.
  const observer = new MutationObserver(() => {
    if (!writing) update();
  });
  observer.observe(editor, { characterData: true, childList: true, subtree: true });

  render();

  return {
    destroy() {
      generation += 1;
      clearTimeout(autoTimer);
      observer.disconnect();
      editor.removeEventListener("input", onInput, true);
      editor.removeEventListener("compositionstart", onCompositionStart);
      editor.removeEventListener("compositionend", onCompositionEnd);
      mounted.host.remove();
    },
    element: mounted.host,
    refresh: update,
  };
}
