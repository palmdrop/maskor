import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

// Safety net: tests must not hit the network. customFetch issues relative URLs
// (`/api/...`), which happy-dom resolves against its default origin
// (http://localhost:3000), turning an unmocked request into an opaque
// ECONNREFUSED. Replace fetch with a stub that throws at the call site so a
// missing mock is loud instead of silent. Tests that need fetch override this
// via vi.stubGlobal("fetch", ...) in their own beforeEach.
beforeEach(() => {
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = typeof input === "string" ? input : String(input);
    throw new Error(
      `Unmocked fetch in test: ${url}. Stub it with vi.stubGlobal("fetch", ...) or seed the query cache.`,
    );
  });
});
