import { beforeEach, describe, expect, it } from "vitest";

import { COLLAPSE_THRESHOLD, mountInlineCard } from "./inline.js";

beforeEach(() => {
  document.body.innerHTML = "<div id=\"message\">Did anyone else beat that boss?</div>";
});

function target(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#message");
  if (!element) throw new Error("fixture is missing");
  return element;
}

function cardText(card: ReturnType<typeof mountInlineCard>): string {
  return card.element.shadowRoot?.querySelector("p")?.textContent ?? "";
}

describe("mountInlineCard", () => {
  it("appears under the original message and leaves it untouched", () => {
    const message = target();
    const card = mountInlineCard(message);

    expect(message.nextElementSibling).toBe(card.element);
    expect(message.textContent).toBe("Did anyone else beat that boss?");
  });

  it("says it is working before the translation arrives", () => {
    expect(cardText(mountInlineCard(target()))).toContain("번역 중");
  });

  it("shows the translation once it arrives", () => {
    const card = mountInlineCard(target());
    card.setResult("그 보스 다른 분들도 깼나요?");
    expect(cardText(card)).toContain("그 보스 다른 분들도 깼나요?");
  });

  it("shows why a translation failed rather than staying blank", () => {
    const card = mountInlineCard(target());
    card.setFailure("번역 서버에 연결하지 못했어요.");

    expect(cardText(card)).toBe("번역 서버에 연결하지 못했어요.");
    const retry = card.element.shadowRoot?.querySelector("button");
    expect(retry?.hidden).toBe(false);
  });

  it("calls back when the reader retries", () => {
    let retries = 0;
    const card = mountInlineCard(target(), { onRetry: () => (retries += 1) });
    card.setFailure("번역 서버에 연결하지 못했어요.");
    card.element.shadowRoot?.querySelector("button")?.click();

    expect(retries).toBe(1);
  });

  it("collapses a long translation behind a toggle", () => {
    const card = mountInlineCard(target());
    const long = "가".repeat(COLLAPSE_THRESHOLD + 1);
    card.setResult(long);

    const paragraph = card.element.shadowRoot?.querySelector("p");
    const toggle = card.element.shadowRoot?.querySelector("button");
    expect(paragraph?.classList.contains("clamped")).toBe(true);
    expect(toggle?.hidden).toBe(false);
    expect(toggle?.textContent).toBe("더 보기");

    toggle?.click();
    expect(paragraph?.classList.contains("clamped")).toBe(false);
    expect(toggle?.textContent).toBe("접기");
  });

  it("leaves a short translation fully visible", () => {
    const card = mountInlineCard(target());
    card.setResult("짧은 번역");

    expect(card.element.shadowRoot?.querySelector("p")?.classList.contains("clamped")).toBe(false);
    expect(card.element.shadowRoot?.querySelector("button")?.hidden).toBe(true);
  });

  it("removes itself completely when destroyed", () => {
    const card = mountInlineCard(target());
    card.destroy();
    expect(document.querySelector("#message")?.nextElementSibling).toBeNull();
  });
});
