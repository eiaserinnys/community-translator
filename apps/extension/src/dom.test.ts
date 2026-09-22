import { beforeEach, describe, expect, it } from "vitest";

import { isOwnElement, mountShadowHost, readMessageText, TRANSLATOR_HOST_TAG } from "./dom.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function fixture(html: string): HTMLElement {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("fixture must contain one element");
  }
  return element;
}

describe("readMessageText", () => {
  it("reads the visible message text", () => {
    const element = fixture("<div>Did anyone else beat that boss?</div>");
    expect(readMessageText(element, "discord")).toBe("Did anyone else beat that boss?");
  });

  it("leaves code and preformatted blocks out of the translation", () => {
    const element = fixture("<div>try <code>--force</code> instead<pre>npm run x</pre></div>");
    expect(readMessageText(element, "discord")).toBe("try  instead");
  });

  it("ignores decorative and hidden nodes", () => {
    const element = fixture(
      '<div>real text<span aria-hidden="true">hidden</span><span class="timestamp_abc">12:00</span></div>',
    );
    expect(readMessageText(element, "discord")).toBe("real text");
  });

  it("never reads back a translation the extension itself added", () => {
    const element = fixture("<div>original text</div>");
    mountShadowHost(element, "beforeend", "<p>번역문</p>");
    expect(readMessageText(element, "discord")).toBe("original text");
  });

  it("keeps X emoji alt text, which carries meaning in a post", () => {
    const element = fixture('<div>nice run <img alt=":fire:" src="x.png"></div>');
    expect(readMessageText(element, "x")).toBe("nice run :fire:");
  });

  it("does not substitute image alt text on other sites", () => {
    const element = fixture('<div>nice run <img alt=":fire:" src="x.png"></div>');
    expect(readMessageText(element, "discord")).toBe("nice run");
  });

  it("strips zero-width characters that would change the cache key", () => {
    const element = fixture("<div>hello​there</div>");
    expect(readMessageText(element, "discord")).toBe("hellothere");
  });
});

describe("mountShadowHost", () => {
  it("renders inside a shadow root so the page cannot restyle the card", () => {
    const element = fixture("<div>message</div>");
    const { host, shadow } = mountShadowHost(element, "afterend", "<p>번역문</p>");

    expect(host.tagName.toLowerCase()).toBe(TRANSLATOR_HOST_TAG);
    expect(element.nextElementSibling).toBe(host);
    expect(shadow.querySelector("p")?.textContent).toBe("번역문");
    expect(host.shadowRoot).not.toBeNull();
  });

  it("marks its own nodes so the scanner can skip them", () => {
    const element = fixture("<div>message</div>");
    const { host } = mountShadowHost(element, "afterend", "<p>번역문</p>");

    expect(isOwnElement(host)).toBe(true);
    expect(isOwnElement(element)).toBe(false);
  });
});
