import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";

let testContext: ReturnType<typeof createTestApp>;

beforeAll(() => {
  testContext = createTestApp();
});

afterAll(() => {
  testContext.cleanup();
});

describe("GET /doc", () => {
  it("returns a valid OpenAPI 3.1 document", async () => {
    const response = await testContext.app.request("/doc");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("Maskor API");
    expect(typeof body.paths).toBe("object");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });

  it("includes all resource route groups in the spec", async () => {
    const response = await testContext.app.request("/doc");
    const body = (await response.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(body.paths);

    expect(paths.some((p) => p.startsWith("/projects"))).toBe(true);
    expect(paths.some((p) => p.includes("/fragments"))).toBe(true);
    expect(paths.some((p) => p.includes("/aspects"))).toBe(true);
    expect(paths.some((p) => p.includes("/notes"))).toBe(true);
    expect(paths.some((p) => p.includes("/references"))).toBe(true);
    expect(paths.some((p) => p.includes("/index/rebuild"))).toBe(true);
  });
});

describe("GET /ui", () => {
  it("returns the Swagger UI HTML page", async () => {
    const response = await testContext.app.request("/ui");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("swagger");
  });
});
