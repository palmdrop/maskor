import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVaultEvents } from "./useVaultEvents";

// Capture every URL the hook hands to EventSource so we can assert it routes
// through the `/api` proxy instead of a hardcoded host+port.
const constructedUrls: string[] = [];

// Records the registered listeners so a test can dispatch a given vault event type.
const listeners = new Map<string, EventListener>();

class MockEventSource {
  url: string;
  constructor(url: string) {
    this.url = url;
    constructedUrls.push(url);
  }
  addEventListener = vi.fn((type: string, handler: EventListener) => {
    listeners.set(type, handler);
  });
  removeEventListener = vi.fn();
  close = vi.fn();
}

const PROJECT = "proj-1";

const makeQuery = (path: string) => ({ queryKey: [path] }) as unknown as Query;

const renderAndDispatch = (eventType: string) => {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  renderHook(() => useVaultEvents(PROJECT), { wrapper });
  const handler = listeners.get(eventType);
  if (!handler) throw new Error(`no listener registered for ${eventType}`);
  handler(new Event(eventType));

  const call = invalidateSpy.mock.calls.at(-1)?.[0];
  const predicate = call?.predicate as ((query: Query) => boolean) | undefined;
  if (!predicate) throw new Error("invalidateQueries was not called with a predicate");

  // Helper: does the dispatched event invalidate a query under this project-relative path?
  return (relativePath: string) => predicate(makeQuery(`/projects/${PROJECT}/${relativePath}`));
};

describe("useVaultEvents", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    listeners.clear();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the SSE stream through the /api proxy (relative URL, no hardcoded host)", () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useVaultEvents(PROJECT), { wrapper });

    expect(constructedUrls).toEqual([`/api/projects/${PROJECT}/events`]);
  });

  it("a fragment event invalidates fragment/sequence/stats queries but NOT aspects or notes", () => {
    const invalidates = renderAndDispatch("fragment:synced");

    expect(invalidates("fragments")).toBe(true);
    expect(invalidates("fragments/summaries")).toBe(true);
    expect(invalidates("fragments/uuid-1")).toBe(true);
    expect(invalidates("sequences/seq-1/contents")).toBe(true);
    expect(invalidates("stats")).toBe(true);

    // The open editor's siblings are untouched — this is what stops an unrelated change from
    // refetching (and previously clobbering) views it does not affect.
    expect(invalidates("aspects")).toBe(false);
    expect(invalidates("notes")).toBe(false);
    expect(invalidates("references")).toBe(false);
  });

  it("a note event does NOT invalidate fragment queries (open fragment editor is left alone)", () => {
    const invalidates = renderAndDispatch("note:synced");

    expect(invalidates("notes")).toBe(true);
    expect(invalidates("aspects")).toBe(true);
    expect(invalidates("fragments")).toBe(false);
    expect(invalidates("fragments/uuid-1")).toBe(false);
    expect(invalidates("sequences/seq-1/contents")).toBe(false);
  });

  it("vault:reset invalidates every project-scoped query", () => {
    const invalidates = renderAndDispatch("vault:reset");

    expect(invalidates("fragments")).toBe(true);
    expect(invalidates("aspects")).toBe(true);
    expect(invalidates("notes")).toBe(true);
    expect(invalidates("references")).toBe(true);
    expect(invalidates("sequences")).toBe(true);
    expect(invalidates("warnings")).toBe(true);
  });

  it("vault:warning invalidates only the warnings list", () => {
    const invalidates = renderAndDispatch("vault:warning");

    expect(invalidates("warnings")).toBe(true);
    expect(invalidates("fragments")).toBe(false);
    expect(invalidates("aspects")).toBe(false);
  });

  it("never invalidates queries scoped to a different project", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useVaultEvents(PROJECT), { wrapper });
    listeners.get("fragment:synced")?.(new Event("fragment:synced"));

    const predicate = invalidateSpy.mock.calls.at(-1)?.[0]?.predicate as (q: Query) => boolean;
    expect(predicate(makeQuery(`/projects/other-project/fragments`))).toBe(false);
  });
});
