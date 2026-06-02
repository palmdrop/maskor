import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Comment } from "@api/generated/maskorAPI.schemas";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import { MarginColumn } from "./margin-column";

// SlotEditor wraps TipTap/CM6 (not meaningful in happy-dom); stub it as a textarea that surfaces
// value + onChange so the column's create/edit wiring is testable.
vi.mock("./slot-editor", () => ({
  SlotEditor: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea
      data-testid="slot-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
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

const renderColumn = (props: Partial<Parameters<typeof MarginColumn>[0]> = {}) =>
  render(
    <MarginColumn
      projectId="project-1"
      marginEditor={buildMarginEditor()}
      fragmentContent=""
      mode="rich"
      onSave={vi.fn()}
      insertMarkerInBlock={vi.fn()}
      stripMarker={vi.fn()}
      revealMarker={vi.fn()}
      focusMarkerBlock={vi.fn()}
      getScrollElement={() => null}
      getBlockHeights={() => []}
      {...props}
    />,
  );

beforeEach(() => localStorage.clear());

describe("MarginColumn", () => {
  it("renders a slot per fragment block, bound live to its comment", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->\n\nSecond paragraph.",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")] }),
    });
    // The anchored block carries its comment body; the un-annotated block has an empty slot.
    expect(document.querySelector('[data-slot-marker="a"]')).toBeTruthy();
    expect(document.querySelector('[data-slot-block="1"]')).toBeTruthy();
    expect(screen.getByText("on a")).toBeTruthy();
  });

  it("shows no excerpt for anchored comments (alignment + guide line convey the binding)", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a", "the excerpt")] }),
    });
    expect(screen.queryByText("the excerpt")).toBeNull();
  });

  it("gathers orphaned comments at the foot with their excerpt shown", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({
        comments: [comment("a", "on a"), comment("gone", "lost", "lost excerpt")],
      }),
    });
    expect(screen.getByText(/Orphaned \(1\)/)).toBeTruthy();
    expect(screen.getByText("lost excerpt")).toBeTruthy();
  });

  it("type-to-create: typing in an empty slot injects a marker and seeds a bound comment", () => {
    const insertMarkerInBlock = vi.fn();
    const addCommentStub = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->\n\nSecond paragraph.",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")], addCommentStub }),
      insertMarkerInBlock,
    });
    // Activate the empty slot beside the second paragraph (block index 1), then type.
    fireEvent.click(screen.getByText("+ comment"));
    fireEvent.change(screen.getByTestId("slot-editor"), { target: { value: "new thought" } });

    expect(insertMarkerInBlock).toHaveBeenCalledTimes(1);
    expect(insertMarkerInBlock.mock.calls[0]![0]).toBe(1);
    const markerId = insertMarkerInBlock.mock.calls[0]![1] as string;
    expect(addCommentStub).toHaveBeenCalledWith(
      expect.objectContaining({ markerId, body: "new thought" }),
    );
  });

  it("does not create when an activated slot stays empty", () => {
    const insertMarkerInBlock = vi.fn();
    const addCommentStub = vi.fn();
    renderColumn({
      fragmentContent: "Lonely paragraph.",
      marginEditor: buildMarginEditor({ addCommentStub }),
      insertMarkerInBlock,
    });
    fireEvent.click(screen.getByText("+ comment"));
    fireEvent.change(screen.getByTestId("slot-editor"), { target: { value: "   " } });
    expect(insertMarkerInBlock).not.toHaveBeenCalled();
    expect(addCommentStub).not.toHaveBeenCalled();
  });

  it("delete on an active comment strips its marker and removes it (coordinated edit)", () => {
    const stripMarker = vi.fn();
    const removeComment = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")], removeComment }),
      stripMarker,
    });
    // Activate the comment, then delete it.
    fireEvent.click(screen.getByText("on a"));
    fireEvent.mouseDown(screen.getByLabelText("Remove comment"));
    expect(stripMarker).toHaveBeenCalledWith("a");
    expect(removeComment).toHaveBeenCalledWith("a");
  });
});
