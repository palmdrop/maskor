import { describe, it, expect } from "bun:test";
import type { StorageService } from "@maskor/storage";
import { createApp } from "../../app";
import { OPENAPI_DOCUMENT_CONFIG } from "../../openapi-config";
import { assertOpenAPIPathsUseBraces, renderOpenAPISnapshot } from "../../scripts/generate-openapi";

// The snapshot generator (scripts/generate-openapi.ts) builds the document with
// createApp({} as StorageService).getOpenAPIDocument(OPENAPI_DOCUMENT_CONFIG).
// These tests lock the two invariants that make the offline snapshot safe:
// (1) it equals what the live `/doc` endpoint serves, and (2) it can be produced
// without a storage service (handlers never run during generation).
describe("OpenAPI snapshot generator", () => {
  it("produces a document byte-identical to the live /doc endpoint", async () => {
    const liveApp = createApp({} as StorageService);
    const response = await liveApp.request("/doc");
    expect(response.status).toBe(200);
    const liveDocument = await response.json();

    const generatedDocument = createApp({} as StorageService).getOpenAPIDocument(
      OPENAPI_DOCUMENT_CONFIG,
    );

    expect(JSON.stringify(generatedDocument, null, 2)).toBe(JSON.stringify(liveDocument, null, 2));
  });

  it("generates the document without touching the injected storage service", () => {
    // A bare cast proves no handler runs: spec generation only walks route
    // definitions. If this ever reaches into storageService it will throw here.
    const document = createApp({} as StorageService).getOpenAPIDocument(OPENAPI_DOCUMENT_CONFIG);

    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("Maskor API");
    expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(0);
  });
});

// Guards the `:param` vs `{param}` footgun: a Hono `:param` route lands literally
// in the OpenAPI document, so orval builds a client that requests `/visit/:id`.
// The snapshot still equals the routes, so this is the only thing that catches it.
describe("assertOpenAPIPathsUseBraces", () => {
  it("passes for OpenAPI `{param}` template paths", () => {
    expect(() =>
      assertOpenAPIPathsUseBraces({ "/projects/{projectId}/fragments/{fragmentId}": {} }),
    ).not.toThrow();
  });

  it("throws naming the offending path when a route uses `:param` syntax", () => {
    expect(() => assertOpenAPIPathsUseBraces({ "/visit/:fragmentId": {} })).toThrow(
      "/visit/:fragmentId",
    );
  });

  it("does not throw on the real generated document (every route is clean)", () => {
    expect(() => renderOpenAPISnapshot()).not.toThrow();
  });
});
