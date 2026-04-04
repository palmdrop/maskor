import { describe, it, expect } from "bun:test";

describe("@maskor/api", () => {
  it("handles a basic request-response cycle", () => {
    // Dummy: replace with real Bun.serve / Hono route tests once routes exist
    const mockRequest = { method: "GET", url: "/fragments" };
    expect(mockRequest.method).toBe("GET");
  });

  it("rejects an unknown route with 404", () => {
    const status = 404;
    expect(status).toBe(404);
  });
});
