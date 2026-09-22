import { readEditorText } from "./dom.js";

/** Each framework commits its editor state asynchronously; this is the wait for it. */
const COMMIT_DELAY_MS = 100;

export interface EditorWriteOptions {
  /** True while the surrounding controller considers its own state still valid. */
  readonly stillValid: () => boolean;
}

/**
 * Replaces the editor's contents with `value`, or reports that it could not.
 *
 * Discord (Slate), X (Draft) and Reddit (Lexical) all keep a model beside the DOM,
 * so the text is entered the way a person would — select everything, then insert —
 * and the result is read back before the change is treated as done. A rich draft is
 * refused outright rather than risking the loss of a mention or an attachment.
 */
export async function writeEditorText(
  element: Element,
  value: string,
  { stillValid }: EditorWriteOptions,
): Promise<boolean> {
  const before = readEditorText(element);

  if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return readEditorText(element) === value.trim();
  }

  if (!(element instanceof HTMLElement)) return false;
  if (
    element.querySelector(
      '[data-slate-void="true"], img, pre, code, [data-type="mention"], [data-entity-type], strong, b, em, i, a',
    )
  ) {
    return false;
  }

  element.focus();
  await delay(COMMIT_DELAY_MS);
  if (!stillValid() || !element.isConnected || readEditorText(element) !== before) return false;

  const root = element.getRootNode();
  const selection =
    root instanceof Document || root instanceof ShadowRoot
      ? ((root as Document).getSelection?.() ?? window.getSelection())
      : window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  await delay(COMMIT_DELAY_MS);
  if (
    !stillValid() ||
    !element.isConnected ||
    readEditorText(element) !== before ||
    !containsSelection(element, selection)
  ) {
    return false;
  }

  // Slate and Draft accept a synthetic beforeinput; when they do, execCommand would
  // insert the text a second time.
  const handled = !element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: value,
      inputType: "insertText",
    }),
  );
  if (!handled && !document.execCommand("insertText", false, value)) return false;

  await delay(COMMIT_DELAY_MS);
  if (readEditorText(element) !== value.trim()) {
    if (!handled) document.execCommand("undo");
    return false;
  }
  return true;
}

function containsSelection(element: Element, selection: Selection): boolean {
  return (
    selection.anchorNode !== null &&
    selection.focusNode !== null &&
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
