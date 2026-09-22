import { mountShadowHost, prefersDark } from "./dom.js";
import { CARD_STYLES } from "./styles.js";

/** Longer translations are folded so a wall of text never buries the thread. */
export const COLLAPSE_THRESHOLD = 220;

export interface InlineCardOptions {
  readonly onRetry?: () => void;
}

export interface InlineCard {
  readonly element: HTMLElement;
  destroy(): void;
  setFailure(message: string): void;
  setResult(text: string): void;
}

const MARKUP = `
<style>${CARD_STYLES}</style>
<div class="translation" aria-live="polite">
  <p>번역 중…</p>
  <button type="button" hidden></button>
</div>
`;

export function mountInlineCard(target: Element, options: InlineCardOptions = {}): InlineCard {
  const { host, shadow } = mountShadowHost(target, "afterend", MARKUP);
  if (prefersDark(target)) {
    host.setAttribute("data-dark", "");
  }

  const container = requireElement<HTMLDivElement>(shadow, ".translation");
  const paragraph = requireElement<HTMLParagraphElement>(shadow, "p");
  const button = requireElement<HTMLButtonElement>(shadow, "button");

  return {
    destroy() {
      host.remove();
    },

    element: host,

    setFailure(message: string) {
      // A failure is stated, never swallowed: the reader has to be able to tell a
      // missing translation from a broken one.
      paragraph.textContent = message;
      paragraph.classList.remove("clamped");
      container.classList.add("error");
      button.hidden = false;
      button.textContent = "다시 시도";
      button.onclick = () => options.onRetry?.();
    },

    setResult(text: string) {
      paragraph.textContent = `(${text})`;
      container.classList.remove("error");

      if (text.length <= COLLAPSE_THRESHOLD) {
        paragraph.classList.remove("clamped");
        button.hidden = true;
        button.onclick = null;
        return;
      }

      paragraph.classList.add("clamped");
      button.hidden = false;
      button.textContent = "더 보기";
      button.onclick = () => {
        const clamped = paragraph.classList.toggle("clamped");
        button.textContent = clamped ? "더 보기" : "접기";
      };
    },
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Inline card markup is missing ${selector}`);
  }
  return element;
}
