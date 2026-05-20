import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

const PROJECT_ID = "proj-1";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

const rebuildMutate = vi.fn();

vi.mock("@api/generated/index", () => ({
  useRebuildIndex: vi.fn(() => ({ mutate: rebuildMutate, isPending: false })),
}));

vi.mock("@api/generated/projects/projects", () => ({
  useUpdateProject: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  })),
  getGetProjectQueryKey: vi.fn(() => []),
  getListProjectsQueryKey: vi.fn(() => []),
}));

import { GeneralTab } from "../GeneralTab";

const makeProject = () => ({
  projectUUID: PROJECT_ID,
  name: "Test Project",
  suggestion: { readinessThreshold: 0.8 },
  editor: { fontSize: 16, maxParagraphWidth: 80, vimMode: false, rawMarkdownMode: false },
  advanced: { showFragmentStats: false },
});

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <CommandsProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </CommandsProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralTab", () => {
  it("calls rebuildIndex.mutate when Rebuild index is clicked", () => {
    wrap(<GeneralTab project={makeProject() as never} />);
    fireEvent.click(screen.getByRole("button", { name: /rebuild index/i }));
    expect(rebuildMutate).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });
});
