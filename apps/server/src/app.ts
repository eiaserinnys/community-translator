import {
  translationFailureMessage,
  type components,
  type paths,
  type TranslationErrorCode,
} from "@community-translator/contracts";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";

import { BearerTokenVerifier } from "./auth.js";
import { TranslationFailure, type TranslationRequest, type Translator } from "./translator.js";

type HealthResponse = paths["/health"]["get"]["responses"][200]["content"]["application/json"];
type TranslateResponse = components["schemas"]["TranslateResponse"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

export interface BuildAppOptions {
  bearerToken: string;
  translator: Translator;
}

// Mirrors the TranslateRequest schema in openapi.yaml. strict() rejects unknown
// fields so a client cannot smuggle an option the contract never promised.
const translateRequestSchema = z
  .object({
    site: z.enum(["discord", "reddit", "x"]).optional(),
    target: z.enum(["KO", "EN-US"]),
    text: z.string().min(1).max(5_000).refine((value) => value.trim().length > 0),
    tone: z.enum(["casual", "neutral"]).optional(),
  })
  .strict();

function errorResponse(code: TranslationErrorCode): ErrorResponse {
  return { code, message: translationFailureMessage(code) };
}

function applyCors(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  // Only the installed extension needs cross-origin access; an ordinary web page
  // must not be able to spend this server's codex budget.
  if (!origin?.startsWith("chrome-extension://")) {
    return;
  }
  reply.headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
}

function isProtectedPath(url: string): boolean {
  return url.split("?", 1)[0] === "/translate";
}

export function buildApp({ bearerToken, translator }: BuildAppOptions) {
  const app = Fastify({ logger: false });
  const tokenVerifier = new BearerTokenVerifier(bearerToken);

  app.addHook("onRequest", async (request, reply) => {
    applyCors(request, reply);
    if (!isProtectedPath(request.url) || request.method === "OPTIONS") {
      return;
    }
    if (!tokenVerifier.accepts(request.headers.authorization)) {
      return reply.code(401).send(errorResponse("unauthorized"));
    }
  });

  app.get<{ Reply: HealthResponse }>("/health", async (_request, reply) => {
    const health = { status: "ok" } satisfies HealthResponse;
    return reply.code(200).send(health);
  });

  app.options("/translate", async (_request, reply) => reply.code(204).send());

  app.post<{ Reply: TranslateResponse | ErrorResponse }>("/translate", async (request, reply) => {
    let parsed: z.infer<typeof translateRequestSchema>;
    try {
      parsed = translateRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(errorResponse("invalid_request"));
    }

    const translationRequest: TranslationRequest = {
      target: parsed.target,
      text: parsed.text,
      ...(parsed.site === undefined ? {} : { site: parsed.site }),
      ...(parsed.tone === undefined ? {} : { tone: parsed.tone }),
    };

    try {
      const result = await translator.translate(translationRequest);
      return reply.code(200).send({
        glossaryTerms: result.glossaryTerms,
        model: result.model,
        target: parsed.target,
        text: result.text,
      });
    } catch (error) {
      // Only the mapped Korean sentence reaches the reader: a raw codex or socket
      // message could carry a path, a host or a token fragment.
      const code = error instanceof TranslationFailure ? error.code : "translation_failed";
      request.log.error({ err: error }, "translation failed");
      return reply.code(503).send(errorResponse(code));
    }
  });

  return app;
}
