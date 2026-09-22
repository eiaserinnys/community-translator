/** The server rejects anything longer, so the extension never sends it. */
export const MAX_TRANSLATION_LENGTH = 5_000;

const HANGUL = /[가-힣]/u;

const NON_ENGLISH_SCRIPTS =
  /[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}]/u;

const NON_KOREAN_SCRIPTS =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}]/u;

// URLs, @mentions, HTML-ish tags, :emoji_names: and code spans are latin but carry
// no language, so they must not make a non-English message look English.
const LANGUAGE_NEUTRAL = /https?:\/\/\S+|www\.\S+|<[^>]+>|@[\w.-]+|:[\w+-]+:|`[^`]*`/giu;

export function isEnglishProse(text: string): boolean {
  const prose = text.replace(LANGUAGE_NEUTRAL, " ");
  if (NON_ENGLISH_SCRIPTS.test(prose)) return false;

  const letters = prose.match(/\p{L}/gu) ?? [];
  const english = prose.match(/[a-zA-Z]/gu) ?? [];
  return english.length >= 3 && english.length / Math.max(letters.length, 1) >= 0.9;
}

export function isKoreanDraft(text: string): boolean {
  return HANGUL.test(text) && !NON_KOREAN_SCRIPTS.test(text);
}

export function isTranslatableLength(text: string): boolean {
  return text.trim().length > 0 && text.length <= MAX_TRANSLATION_LENGTH;
}
