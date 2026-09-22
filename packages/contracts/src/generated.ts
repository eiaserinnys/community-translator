// Generated from openapi.yaml. Do not edit.
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report service health */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/translate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Translate one community message or draft */
        post: operations["translate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthResponse: {
            /** @enum {string} */
            status: "ok";
        };
        /** @enum {string} */
        TranslationTarget: "KO" | "EN-US";
        /** @enum {string} */
        TranslationTone: "casual" | "neutral";
        /** @enum {string} */
        TranslationSite: "discord" | "reddit" | "x";
        TranslateRequest: {
            text: string;
            target: components["schemas"]["TranslationTarget"];
            tone?: components["schemas"]["TranslationTone"];
            site?: components["schemas"]["TranslationSite"];
        };
        TranslateResponse: {
            text: string;
            target: components["schemas"]["TranslationTarget"];
            model: string;
            /** @description How many glossary entries were injected into the prompt. */
            glossaryTerms: number;
        };
        ErrorResponse: {
            /** @enum {string} */
            code: "invalid_request" | "unauthorized" | "translation_busy" | "translation_timeout" | "translation_unavailable" | "translation_quota_exhausted" | "translation_failed";
            /** @description Korean text the extension shows to the reader as-is. */
            message: string;
        };
    };
    responses: {
        /** @description The request was invalid. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Bearer authentication failed. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description The translation backend did not produce a result. */
        TranslationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The service is healthy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    translate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TranslateRequest"];
            };
        };
        responses: {
            /** @description The translated text. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranslateResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            503: components["responses"]["TranslationFailed"];
        };
    };
}
