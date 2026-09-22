import type { components } from "@community-translator/contracts";

import type { GlossaryEntry } from "./glossary.js";

type TranslationTarget = components["schemas"]["TranslationTarget"];
type TranslationTone = components["schemas"]["TranslationTone"];
type TranslationSite = components["schemas"]["TranslationSite"];

export interface TranslationPromptInput {
  readonly glossary: readonly GlossaryEntry[];
  readonly site?: TranslationSite | undefined;
  readonly target: TranslationTarget;
  readonly text: string;
  readonly tone?: TranslationTone | undefined;
}

const SITE_LABELS: Record<TranslationSite, string> = {
  discord: "Discord",
  reddit: "Reddit",
  x: "X",
};

const SHARED_RULES = [
  "Reply with only the translation. Do not add a preamble, quotation marks, notes or explanation.",
  "Keep names, @mentions, #channels, URLs, emoji and code spans exactly as they appear.",
  "Preserve the line breaks and list structure of the source.",
  "Do not add information the source does not contain, and do not answer the message.",
];

export function buildTranslationPrompt(input: TranslationPromptInput): string {
  const sections: string[] = [
    "You are the translation engine of a browser extension for gaming communities.",
    "",
    ...directionLines(input),
    "",
    "Rules:",
    ...[...SHARED_RULES, ...styleRules(input)].map((rule) => `- ${rule}`),
  ];

  if (input.glossary.length > 0) {
    sections.push(
      "",
      "Use exactly these renderings for the terms below:",
      ...input.glossary.map((entry) => `- ${entry.en} ↔ ${entry.kr}`),
    );
  }

  sections.push("", "<<<MESSAGE", input.text, "MESSAGE>>>");
  return sections.join("\n");
}

function directionLines(input: TranslationPromptInput): string[] {
  const origin =
    input.site === undefined ? [] : [`The message comes from ${SITE_LABELS[input.site]}.`];

  return input.target === "KO"
    ? ["Source language: English", "Target language: Korean", ...origin]
    : ["Source language: Korean", "Target language: English (United States)", ...origin];
}

function styleRules(input: TranslationPromptInput): string[] {
  if (input.target === "KO") {
    return ["Write natural, everyday Korean that a community reader would use."];
  }
  return input.tone === "neutral"
    ? ["Write clear, neutral English."]
    : ["Write natural, friendly conversational English."];
}
