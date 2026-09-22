import type { TranslatedSite } from "./site.js";

/** Every node this extension adds to a page lives inside one of these hosts. */
export const TRANSLATOR_HOST_TAG = "ct-translation";

const IGNORED_IN_MESSAGES = [
  TRANSLATOR_HOST_TAG,
  "pre",
  "code",
  "script",
  "style",
  '[aria-hidden="true"]',
  '[class*="spoilerContent"]',
  '[class*="timestamp_"]',
].join(", ");

const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/gu;

export function isOwnElement(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return false;
  if (element.closest(TRANSLATOR_HOST_TAG)) return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.host.matches(TRANSLATOR_HOST_TAG);
}

export function mountShadowHost(
  anchor: Element,
  position: InsertPosition,
  markup: string,
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement(TRANSLATOR_HOST_TAG);
  // A shadow root keeps the page's stylesheets from reaching the card and keeps
  // the card's styles from leaking back into the page.
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = markup;
  anchor.insertAdjacentElement(position, host);
  return { host, shadow };
}

/**
 * The text a reader actually sees, with the extension's own additions, code blocks
 * and decorative nodes left out so a translation is never fed back in as a source.
 */
export function readMessageText(element: Element, site: TranslatedSite): string {
  const clone = element.cloneNode(true) as Element;

  if (site === "x") {
    // On X an emoji is an <img> whose alt text is the only thing carrying meaning.
    for (const image of clone.querySelectorAll("img[alt]")) {
      image.replaceWith(document.createTextNode(image.getAttribute("alt") ?? ""));
    }
  }

  for (const node of clone.querySelectorAll(IGNORED_IN_MESSAGES)) {
    node.remove();
  }

  return (clone.textContent ?? "").replace(ZERO_WIDTH, "").trim();
}

export function readEditorText(element: Element): string {
  const raw =
    element instanceof HTMLTextAreaElement
      ? element.value
      : ((element as HTMLElement).innerText ?? element.textContent ?? "");
  return raw.replace(ZERO_WIDTH, "").trim();
}

/** Only what is on screen, plus a little below it, is worth translating. */
export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight + 120;
}

/** Walks up through shadow boundaries to find the first opaque background. */
export function prefersDark(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const values = getComputedStyle(current).backgroundColor.match(/[\d.]+/gu)?.map(Number);
    if (values && (values.length === 3 || (values[3] ?? 0) > 0.5)) {
      const [red = 0, green = 0, blue = 0] = values;
      return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 135;
    }
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
