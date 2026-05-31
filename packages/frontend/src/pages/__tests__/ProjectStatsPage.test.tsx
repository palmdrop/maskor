import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { FragmentStatsSummary } from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "proj-1";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    <a className={className}>{children}</a>
  ),
}));

vi.mock("../../api/generated/stats/stats", () => ({ useGetProjectStats: vi.fn() }));

const makeFragment = (overrides: Partial<FragmentStatsSummary> = {}): FragmentStatsSummary => ({
  fragmentUuid: crypto.randomUUID(),
  key: "test-fragment",
  wordCount: 100,
  updatedAt: "2026-01-01T12:00:00Z",
  readiness: 0.5,
  isDiscarded: false,
  ...overrides,
});

const makeStatsResponse = (fragments: FragmentStatsSummary[]) => ({
  status: 200 as const,
  data: {
    global: {
      totalCount: fragments.filter((fragment) => !fragment.isDiscarded).length,
      discardedCount: fragments.filter((fragment) => fragment.isDiscarded).length,
      readyCount: 0,
      averageReadiness: 0.5,
      readinessHistogram: [1, 0, 1, 0, 0] as [number, number, number, number, number],
      totalWordCount: 200,
      averageWordCount: 100,
    },
    fragments,
  },
});

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const { useGetProjectStats } = await import("../../api/generated/stats/stats");
const { ProjectStatsPage } = await import("../ProjectStatsPage");

describe("ProjectStatsPage", () => {
  it("hides discarded fragments by default", () => {
    const fragments = [
      makeFragment({ key: "active-fragment", isDiscarded: false }),
      makeFragment({ key: "discarded-fragment", isDiscarded: true }),
    ];
    (useGetProjectStats as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeStatsResponse(fragments),
      isLoading: false,
    });

    render(<ProjectStatsPage />, { wrapper: wrap() });

    expect(screen.getByText("active-fragment")).toBeDefined();
    expect(screen.queryByText("discarded-fragment")).toBeNull();
  });

  it("shows discarded fragments when toggle is on", () => {
    const fragments = [
      makeFragment({ key: "active-fragment", isDiscarded: false }),
      makeFragment({ key: "discarded-fragment", isDiscarded: true }),
    ];
    (useGetProjectStats as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeStatsResponse(fragments),
      isLoading: false,
    });

    render(<ProjectStatsPage />, { wrapper: wrap() });

    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);

    expect(screen.getByText("active-fragment")).toBeDefined();
    expect(screen.getByText("discarded-fragment")).toBeDefined();
  });

  it("renders discarded fragment with strikethrough styling", () => {
    const fragments = [makeFragment({ key: "discarded-fragment", isDiscarded: true })];
    (useGetProjectStats as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeStatsResponse(fragments),
      isLoading: false,
    });

    render(<ProjectStatsPage />, { wrapper: wrap() });

    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);

    const discardedKey = screen.getByText("discarded-fragment");
    expect(discardedKey.className).toContain("line-through");
  });

  it("global stats are unaffected by toggle", () => {
    const fragments = [
      makeFragment({ key: "active-fragment", wordCount: 100, isDiscarded: false }),
      makeFragment({ key: "discarded-fragment", wordCount: 50, isDiscarded: true }),
    ];
    const response = makeStatsResponse(fragments);
    (useGetProjectStats as ReturnType<typeof vi.fn>).mockReturnValue({
      data: response,
      isLoading: false,
    });

    render(<ProjectStatsPage />, { wrapper: wrap() });

    const totalTiles = screen.getAllByText("1");
    const totalCount = totalTiles.length;

    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);

    expect(screen.getAllByText("1").length).toBe(totalCount);
  });
});
