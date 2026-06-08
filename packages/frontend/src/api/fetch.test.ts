import { describe, it, expect, vi, afterEach } from "vitest";
import { customFetch } from "./fetch";
import { ApiRequestError } from "./errors";

const errorResponse = (headers: Record<string, string>) =>
  new Response(JSON.stringify({ message: "boom" }), {
    status: 500,
    headers: { "Content-Type": "application/json", ...headers },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("customFetch", () => {
  it("sets correlationId from the X-Correlation-Id response header on error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse({ "X-Correlation-Id": "corr-123" })),
    );

    await expect(customFetch("/x", {})).rejects.toMatchObject({
      correlationId: "corr-123",
      statusCode: 500,
    });
  });

  it("leaves correlationId undefined when the header is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse({})),
    );

    const error = await customFetch("/x", {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).correlationId).toBeUndefined();
  });
});
