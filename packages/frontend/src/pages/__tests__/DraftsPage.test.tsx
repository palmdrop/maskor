import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const PROJECT_ID = "project-uuid-1";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
}));

// Drafts is read via useSuspenseQuery; the mocked suspense options return
// initialData from this holder so the hook resolves synchronously. (useQueryClient
// is left real so useSuspenseQuery resolves against the provider's client.)
const draftsHolder = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("@api/generated/drafts/drafts", () => ({
  useCreateDraft: vi.fn(),
  useDeleteDraft: vi.fn(),
  useRestoreDraft: vi.fn(),
  getListDraftsQueryKey: vi.fn(() => ["drafts"]),
  getListDraftsSuspenseQueryOptions: () => ({
    queryKey: ["drafts"],
    queryFn: vi.fn(),
    initialData: draftsHolder.data,
    staleTime: Infinity,
  }),
}));

import { DraftsPage } from "../DraftsPage/DraftsPage";
import { useCreateDraft, useDeleteDraft, useRestoreDraft } from "@api/generated/drafts/drafts";

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const sampleDraft = {
  uuid: "draft-1",
  name: "Draft 1",
  note: "Before the rewrite",
  createdAt: "2026-05-18T12:00:00.000Z",
  entityCounts: { fragments: 3, aspects: 1, notes: 0, references: 0, sequences: 1 },
};

const emptyMutation = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
  data: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  (useCreateDraft as unknown as Mock).mockReturnValue(emptyMutation);
  (useDeleteDraft as unknown as Mock).mockReturnValue(emptyMutation);
  (useRestoreDraft as unknown as Mock).mockReturnValue(emptyMutation);
});

describe("DraftsPage", () => {
  it("renders an empty state when no drafts exist", () => {
    draftsHolder.data = { status: 200, data: [] };
    wrap(<DraftsPage />);
    expect(screen.getByText(/No drafts yet/)).toBeTruthy();
  });

  it("renders a draft list with name, note, and counts", () => {
    draftsHolder.data = { status: 200, data: [sampleDraft] };
    wrap(<DraftsPage />);
    expect(screen.getByText("Draft 1")).toBeTruthy();
    expect(screen.getByText("Before the rewrite")).toBeTruthy();
    expect(screen.getByText(/3 fragments/)).toBeTruthy();
  });

  it("calls useCreateDraft with name + note when create dialog submits", () => {
    const mutate = vi.fn();
    (useCreateDraft as unknown as Mock).mockReturnValue({
      ...emptyMutation,
      mutate,
    });
    draftsHolder.data = { status: 200, data: [] };
    wrap(<DraftsPage />);

    act(() => {
      fireEvent.click(screen.getByText("Create draft"));
    });

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My snapshot" } });

    const noteInput = screen.getByLabelText("Note (optional)") as HTMLInputElement;
    fireEvent.change(noteInput, { target: { value: "Pre-rewrite" } });

    act(() => {
      fireEvent.click(screen.getByText("Create"));
    });

    expect(mutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      data: { name: "My snapshot", note: "Pre-rewrite" },
    });
  });

  it("calls useDeleteDraft with the draft id when delete is confirmed", () => {
    const mutate = vi.fn();
    (useDeleteDraft as unknown as Mock).mockReturnValue({
      ...emptyMutation,
      mutate,
    });
    draftsHolder.data = { status: 200, data: [sampleDraft] };
    wrap(<DraftsPage />);

    act(() => {
      fireEvent.click(screen.getByText("Delete"));
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    });

    expect(mutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      draftId: "draft-1",
    });
  });

  it("calls useRestoreDraft with saveCurrentFirst=true by default", () => {
    const mutate = vi.fn();
    (useRestoreDraft as unknown as Mock).mockReturnValue({
      ...emptyMutation,
      mutate,
    });
    draftsHolder.data = { status: 200, data: [sampleDraft] };
    wrap(<DraftsPage />);

    act(() => {
      fireEvent.click(screen.getByText("Restore"));
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    });

    const call = mutate.mock.calls.at(0)?.[0];
    expect(call.projectId).toBe(PROJECT_ID);
    expect(call.draftId).toBe("draft-1");
    expect(call.data.saveCurrentFirst).toBe(true);
    expect(typeof call.data.preRestoreName).toBe("string");
  });

  it("passes saveCurrentFirst=false when the safety checkbox is unchecked", () => {
    const mutate = vi.fn();
    (useRestoreDraft as unknown as Mock).mockReturnValue({
      ...emptyMutation,
      mutate,
    });
    draftsHolder.data = { status: 200, data: [sampleDraft] };
    wrap(<DraftsPage />);

    act(() => {
      fireEvent.click(screen.getByText("Restore"));
    });

    const checkbox = screen.getByLabelText(
      "Save current state as a draft first",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    });

    const call = mutate.mock.calls.at(0)?.[0];
    expect(call.data.saveCurrentFirst).toBe(false);
    expect(call.data.preRestoreName).toBeUndefined();
  });
});
