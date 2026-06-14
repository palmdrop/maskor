import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVaultEvents } from "./useVaultEvents";

// Capture every URL the hook hands to EventSource so we can assert it routes
// through the `/api` proxy instead of a hardcoded host+port.
const constructedUrls: string[] = [];

class MockEventSource {
  url: string;
  constructor(url: string) {
    this.url = url;
    constructedUrls.push(url);
  }
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useVaultEvents", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the SSE stream through the /api proxy (relative URL, no hardcoded host)", () => {
    renderHook(() => useVaultEvents("proj-1"), { wrapper });

    expect(constructedUrls).toEqual(["/api/projects/proj-1/events"]);
  });
});
