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
  serializedContent: "",
  serializedServer: "",
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

  it("rebinds an orphaned comment once its marker reappears in the fragment", () => {
    const comments = [comment("x")];
    // Orphaned while the marker is gone.
    expect(partitionComments(comments, []).orphaned.map((c) => c.markerId)).toEqual(["x"]);
    // Re-adding the marker (e.g. undo, or re-typing the raw marker) rebinds it.
    const rebound = partitionComments(comments, ["x"]);
    expect(rebound.anchored.map((c) => c.markerId)).toEqual(["x"]);
    expect(rebound.orphaned).toHaveLength(0);
  });

  it("ignores a fragment marker that has no matching comment (inert, self-healing)", () => {
    // A marker present in the fragment but with no stored comment contributes nothing — it is inert
    // and cleanable, never surfaced as a phantom comment.
    const { anchored, orphaned } = partitionComments([comment("a")], ["a", "stray"]);
    expect(anchored.map((c) => c.markerId)).toEqual(["a"]);
    expect(orphaned).toHaveLength(0);
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

  it("moves a comment to the orphaned group when its block is deleted, and back on rebind", () => {
    const marginEditor = buildMarginEditor({ comments: [comment("anchor", "kept")] });
    const { rerender } = render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["anchor"]}
        onSave={vi.fn()}
      />,
    );
    // Anchored: no orphaned group.
    expect(screen.queryByText(/Orphaned/)).toBeNull();

    // Delete the annotated block (marker gone from the live fragment) → orphaned.
    rerender(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={[]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Orphaned \(1\)/)).toBeTruthy();

    // Marker reappears (rebind) → orphaned group gone again.
    rerender(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["anchor"]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Orphaned/)).toBeNull();
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

  it("routes delete through onRemoveComment with the orphaned flag (coordinated marker strip)", () => {
    const onRemoveComment = vi.fn();
    const marginEditor = buildMarginEditor({
      comments: [comment("live", "kept"), comment("dead", "lost")],
    });
    render(
      <MarginPanel
        projectId="project-1"
        marginEditor={marginEditor}
        fragmentMarkerIds={["live"]}
        onRemoveComment={onRemoveComment}
        onSave={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByLabelText("Remove comment");
    // First card is the anchored "live" comment; last is the orphaned "dead" comment.
    fireEvent.click(removeButtons[0]!);
    expect(onRemoveComment).toHaveBeenCalledWith("live", false);
    fireEvent.click(removeButtons[removeButtons.length - 1]!);
    expect(onRemoveComment).toHaveBeenCalledWith("dead", true);
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
