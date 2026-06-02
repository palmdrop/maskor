import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Comment } from "@api/generated/maskorAPI.schemas";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import { MarginPanel, partitionComments } from "./margin-panel";

// TipTap doesn't render meaningfully in happy-dom; the notes editor isn't under test here.
vi.mock("./margin-notes-editor", () => ({
  MarginNotesEditor: ({ value }: { value: string }) => (
    <div data-testid="notes-editor">{value}</div>
  ),
}));

const comment = (markerId: string, body = "", excerpt = `excerpt-${markerId}`): Comment => ({
  markerId,
  excerpt,
  body,
});

const buildMarginEditor = (
  overrides: Partial<UseMarginEditorResult> = {},
): UseMarginEditorResult => ({
  notes: "",
  comments: [],
  exists: true,
  isLoading: false,
  isDirty: false,
  isSaving: false,
  setNotes: vi.fn(),
  updateCommentBody: vi.fn(),
  addCommentStub: vi.fn(),
  removeComment: vi.fn(),
  save: vi.fn(),
  revertToServer: vi.fn(),
  serialize: vi.fn(() => ""),
  applySerialized: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe("partitionComments", () => {
  it("orders anchored comments by fragment block order and splits orphans", () => {
    const comments = [comment("c"), comment("a"), comment("gone"), comment("b")];
    const { anchored, orphaned } = partitionComments(comments, ["a", "b", "c"]);
    expect(anchored.map((entry) => entry.markerId)).toEqual(["a", "b", "c"]);
    expect(orphaned.map((entry) => entry.markerId)).toEqual(["gone"]);
  });

  it("treats a comment whose marker is missing from the fragment as orphaned", () => {
    const { anchored, orphaned } = partitionComments([comment("x")], []);
    expect(anchored).toHaveLength(0);
    expect(orphaned.map((entry) => entry.markerId)).toEqual(["x"]);
  });
});

describe("MarginPanel", () => {
  it("renders the orphaned group for comments whose marker is gone", () => {
    const marginEditor = buildMarginEditor({
      comments: [comment("live", "kept"), comment("dead", "lost")],
    });
    render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["live"]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Orphaned \(1\)/)).toBeTruthy();
    expect(screen.getByText("excerpt-dead")).toBeTruthy();
  });

  it("reveals the annotated block when an anchored comment's excerpt is clicked", () => {
    const onRevealMarker = vi.fn();
    const marginEditor = buildMarginEditor({ comments: [comment("live", "kept")] });
    render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["live"]}
        onSave={vi.fn()}
        onRevealMarker={onRevealMarker}
      />,
    );
    fireEvent.click(screen.getByText("excerpt-live"));
    expect(onRevealMarker).toHaveBeenCalledWith("live");
  });

  it("shows editable comment bodies after leaving compact mode and removes on ×", () => {
    const removeComment = vi.fn();
    const marginEditor = buildMarginEditor({
      comments: [comment("live", "body text")],
      removeComment,
    });
    render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["live"]}
        onSave={vi.fn()}
      />,
    );
    // Compact (default): no textarea, body shown as preview.
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByText("Expand"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("body text");
    fireEvent.click(screen.getByLabelText("Remove comment"));
    expect(removeComment).toHaveBeenCalledWith("live");
  });

  it("disables Save unless the margin is dirty", () => {
    const marginEditor = buildMarginEditor({ isDirty: false });
    const { rerender } = render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={[]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    rerender(
      <MarginPanel
        projectId="project-1"
        marginEditor={buildMarginEditor({ isDirty: true })}
        fragmentMarkerIds={[]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  });
});
