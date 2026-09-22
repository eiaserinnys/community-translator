export const TRANSLATED_SITES = ["discord", "reddit", "x"] as const;

export type TranslatedSite = (typeof TRANSLATED_SITES)[number];

// An exact hostname table, not a suffix match: discord.com.evil.example must not
// be able to present itself as Discord.
const SITE_BY_HOSTNAME: Readonly<Record<string, TranslatedSite>> = {
  "discord.com": "discord",
  "old.reddit.com": "reddit",
  "twitter.com": "x",
  "www.reddit.com": "reddit",
  "www.twitter.com": "x",
  "www.x.com": "x",
  "x.com": "x",
};

export function siteFor(url: string): TranslatedSite | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return SITE_BY_HOSTNAME[parsed.hostname.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

export interface SiteSelectors {
  /** The editable element the reader writes their draft into. */
  readonly composer: string;
  /**
   * Where the preview card is attached, tried in order. Each site scrolls or clips
   * its input area, so the card sits outside that box rather than inside it.
   */
  readonly composerAnchors: readonly string[];
  /** Message bodies that may need a Korean translation underneath. */
  readonly incoming: string;
}

export const SITE_SELECTORS: Readonly<Record<TranslatedSite, SiteSelectors>> = {
  discord: {
    composer: '[role="textbox"][contenteditable="true"][data-slate-editor="true"]',
    composerAnchors: ['[class*="channelBottomBarArea_"]', '[class*="channelTextArea_"]'],
    incoming: '[id^="message-content-"]:not([class*="repliedTextContent"])',
  },
  reddit: {
    composer:
      'textarea[name="text"], [contenteditable="true"][role="textbox"], shreddit-composer [contenteditable="true"]',
    composerAnchors: ["shreddit-composer"],
    incoming:
      'shreddit-post [slot="title"], shreddit-post [slot="text-body"], shreddit-comment [slot="comment"], .thing .usertext-body > .md, .thing > .entry a.title, [data-testid="post-title"], [data-testid="comment"]',
  },
  x: {
    composer: '[contenteditable="true"][role="textbox"][data-testid^="tweetTextarea_"]',
    composerAnchors: [".DraftEditor-root"],
    incoming: '[data-testid="tweet"] [data-testid="tweetText"]',
  },
};
