import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

const PROJECT_ID = "proj-1";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

const rebuildMutate = vi.fn();
const resetMutate = vi.fn();

vi.mock("@api/generated/index", () => ({
  useRebuildIndex: vi.fn(() => ({ mutate: rebuildMutate, isPending: false })),
  useResetDatabase: vi.fn(() => ({ mutate: resetMutate, isPending: false })),
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
  vi.unstubAllGlobals();
});

describe("GeneralTab", () => {
  it("calls rebuildIndex.mutate when Rebuild index is clicked", () => {
    wrap(<GeneralTab project={makeProject() as never} />);
    fireEvent.click(screen.getByRole("button", { name: /rebuild index/i }));
    expect(rebuildMutate).toHaveBeenCalledWith(
      { projectId: PROJECT_ID },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("resets the database after confirmation when Reset database is clicked", () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    wrap(<GeneralTab project={makeProject() as never} />);

    fireEvent.click(screen.getByRole("button", { name: /reset database/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(resetMutate).toHaveBeenCalledWith(
      { projectId: PROJECT_ID },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("does not reset the database when confirmation is cancelled", () => {
    const confirmSpy = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmSpy);
    wrap(<GeneralTab project={makeProject() as never} />);

    fireEvent.click(screen.getByRole("button", { name: /reset database/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(resetMutate).not.toHaveBeenCalled();
  });
});
