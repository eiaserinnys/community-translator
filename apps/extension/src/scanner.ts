import { mountComposerCard, type ComposerController, type ComposerHost } from "./composer.js";
import { isOwnElement, isVisible, readMessageText } from "./dom.js";
import { mountInlineCard, type InlineCard } from "./inline.js";
import { isEnglishProse, isTranslatableLength } from "./language.js";
import { SITE_SELECTORS, type TranslatedSite } from "./site.js";

/** Batches the bursts of mutations these single-page apps produce. */
const SCAN_DEBOUNCE_MS = 180;
/** How often the content script re-reads settings the reader may have changed. */
const SETTINGS_POLL_MS = 2_500;

export interface ScannerHost extends ComposerHost {
  isActive(): boolean;
  refreshSettings(): Promise<boolean>;
  translateMessage(text: string): Promise<string>;
}

export interface Scanner {
  stop(): void;
}

export function startScanner(site: TranslatedSite, host: ScannerHost): Scanner {
  const selectors = SITE_SELECTORS[site];
  const inlineCards = new Map<Element, { card: InlineCard; text: string }>();
  const composerCards = new Map<Element, ComposerController>();
  const observedRoots = new WeakSet<Node>();

  let route = location.pathname;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const observer = new MutationObserver((records) => {
    // Ignore the mutations this extension caused itself, or every card it adds
    // would schedule another scan.
    const external = records.some(
      (record) =>
        !isOwnElement(record.target) &&
        [...record.addedNodes, ...record.removedNodes].some((node) => !isOwnElement(node)),
    );
    if (external) schedule();
  });

  function roots(): (Document | ShadowRoot)[] {
    const found: (Document | ShadowRoot)[] = [document];
    for (let index = 0; index < found.length; index += 1) {
      const root = found[index];
      if (!root) continue;
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot && !isOwnElement(element)) found.push(element.shadowRoot);
      }
      if (!observedRoots.has(root)) {
        observer.observe(root, { characterData: true, childList: true, subtree: true });
        observedRoots.add(root);
      }
    }
    return found;
  }

  function detachAll(): void {
    for (const { card } of inlineCards.values()) card.destroy();
    inlineCards.clear();
    for (const controller of composerCards.values()) controller.destroy();
    composerCards.clear();
  }

  function dropDetached(): void {
    for (const [element, entry] of inlineCards) {
      if (!element.isConnected || !entry.card.element.isConnected) {
        entry.card.destroy();
        inlineCards.delete(element);
      }
    }
    for (const [element, controller] of composerCards) {
      if (!element.isConnected || !controller.element.isConnected) {
        controller.destroy();
        composerCards.delete(element);
      }
    }
  }

  function translateInto(element: Element, text: string): void {
    inlineCards.get(element)?.card.destroy();
    const card = mountInlineCard(element, { onRetry: () => translateInto(element, text) });
    inlineCards.set(element, { card, text });

    host
      .translateMessage(text)
      .then((translated) => {
        // The message may have been edited, removed or switched off while waiting.
        if (!isCurrent(element, card, text)) return;
        card.setResult(translated);
      })
      .catch((error: unknown) => {
        if (!isCurrent(element, card, text)) return;
        card.setFailure(error instanceof Error ? error.message : "번역에 실패했어요.");
      });
  }

  function isCurrent(element: Element, card: InlineCard, text: string): boolean {
    if (inlineCards.get(element)?.card !== card) return false;
    if (!element.isConnected || !host.isActive()) {
      card.destroy();
      inlineCards.delete(element);
      return false;
    }
    return readMessageText(element, site) === text;
  }

  function scan(): void {
    if (stopped || document.hidden) return;

    if (route !== location.pathname) {
      route = location.pathname;
      detachAll();
    }
    if (!host.isActive()) {
      if (inlineCards.size > 0 || composerCards.size > 0) detachAll();
      return;
    }
    dropDetached();

    for (const root of roots()) {
      for (const element of root.querySelectorAll(selectors.incoming)) {
        if (isOwnElement(element) || element.closest('[contenteditable="true"], textarea')) continue;
        // Only leaf matches, so a nested Reddit body is not translated twice.
        if (element.querySelector(selectors.incoming)) continue;

        const text = readMessageText(element, site);
        const existing = inlineCards.get(element);
        if (existing && existing.text !== text) {
          existing.card.destroy();
          inlineCards.delete(element);
        }
        if (
          !inlineCards.has(element) &&
          isVisible(element) &&
          isTranslatableLength(text) &&
          isEnglishProse(text)
        ) {
          translateInto(element, text);
        }
      }

      for (const element of root.querySelectorAll(selectors.composer)) {
        if (isOwnElement(element) || composerCards.has(element) || !isVisible(element)) continue;
        composerCards.set(element, mountComposerCard(element, composerAnchor(element), host));
      }
    }
  }

  function composerAnchor(editor: Element): Element {
    for (const selector of selectors.composerAnchors) {
      const anchor = editor.closest(selector);
      if (anchor) return anchor;
    }
    return editor;
  }

  function schedule(): void {
    if (scanTimer || stopped) return;
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      scan();
    }, SCAN_DEBOUNCE_MS);
  }

  async function refresh(): Promise<void> {
    const changed = await host.refreshSettings();
    if (stopped) return;
    if (changed) detachAll();
    schedule();
  }

  const onScroll = () => schedule();
  const onVisibilityChange = () => {
    if (!document.hidden) void refresh();
  };
  const poll = setInterval(() => {
    if (!document.hidden) void refresh();
  }, SETTINGS_POLL_MS);

  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  void refresh();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(poll);
      clearTimeout(scanTimer);
      observer.disconnect();
      detachAll();
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
