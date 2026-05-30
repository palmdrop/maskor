// Single source of truth for the OpenAPI document metadata. Shared by the live
// `/doc` endpoint (app.ts) and the static snapshot generator
// (scripts/generate-openapi.ts) so the two cannot drift.
//
// Note: the live endpoint serves this via OpenAPIHono#doc(), which uses the
// OpenAPI 3.0 generator (OpenApiGeneratorV3) and stamps `openapi: "3.1.0"` as a
// label onto a 3.0-structured document. The snapshot generator mirrors that by
// calling getOpenAPIDocument (V3), not getOpenAPI31Document, to stay byte-identical.
export const OPENAPI_DOCUMENT_CONFIG = {
  openapi: "3.1.0",
  info: { title: "Maskor API", version: "0.1.0" },
} as const;
