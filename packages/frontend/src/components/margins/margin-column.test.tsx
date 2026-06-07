import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Comment } from "@api/generated/maskorAPI.schemas";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import type { EditorBlock } from "@components/prose-editor";
import { enumerateBlocks } from "@lib/margins/column.test-helpers";
import { MarginColumn } from "./margin-column";

// In the editor-less harness the real editor's `getBlocks()` is unavailable, so synthesize the block
// list from the fragment content (the editor is the source of truth in production; this mirrors its
// block order with zero geometry).
const blocksFromContent = (content: string): EditorBlock[] =>
  enumerateBlocks(content).map((block) => ({
    markerId: block.markerId,
    text: block.text,
    top: 0,
    height: 0,
  }));

// SlotEditor wraps TipTap/CM6 (not meaningful in happy-dom); stub it as a textarea that surfaces
// value + onChange so the column's create/edit wiring is testable.
vi.mock("./slot-editor", () => ({
  MARGIN_LINE_HEIGHT: 1.6,
  MARGIN_FONT_SIZE: 14,
  SlotEditor: ({
    value,
    onChange,
    onBlur,
  }: {
    value: string;
    onChange: (next: string) => void;
    onBlur?: () => void;
  }) => (
    <textarea
      data-testid="slot-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onBlur?.()}
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

const renderColumn = (props: Partial<Parameters<typeof MarginColumn>[0]> = {}) => {
  const fragmentContent = props.fragmentContent ?? "";
  return render(
    <MarginColumn
      projectId="project-1"
      marginEditor={buildMarginEditor()}
      fragmentContent={fragmentContent}
      fragmentDirty={false}
      mode="rich"
      fontSize={16}
      addAnchorAtBlock={vi.fn()}
      removeAnchor={vi.fn()}
      revealAnchor={vi.fn()}
      focusAnchorBlock={vi.fn()}
      getScrollElement={() => null}
      getBlocks={() => blocksFromContent(fragmentContent)}
      {...props}
    />,
  );
};

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

  it("shows no excerpt for anchored comments (alignment + highlight convey the binding)", () => {
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
    const addAnchorAtBlock = vi.fn();
    const addCommentStub = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->\n\nSecond paragraph.",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")], addCommentStub }),
      addAnchorAtBlock,
    });
    // Activate the empty slot beside the second paragraph (block index 1), then type.
    fireEvent.click(screen.getByText("+ comment"));
    fireEvent.change(screen.getByTestId("slot-editor"), { target: { value: "new thought" } });

    expect(addAnchorAtBlock).toHaveBeenCalledTimes(1);
    expect(addAnchorAtBlock.mock.calls[0]![0]).toBe(1);
    const markerId = addAnchorAtBlock.mock.calls[0]![1] as string;
    expect(addCommentStub).toHaveBeenCalledWith(
      expect.objectContaining({ markerId, body: "new thought" }),
    );
  });

  it("does not create when an activated slot stays empty", () => {
    const addAnchorAtBlock = vi.fn();
    const addCommentStub = vi.fn();
    renderColumn({
      fragmentContent: "Lonely paragraph.",
      marginEditor: buildMarginEditor({ addCommentStub }),
      addAnchorAtBlock,
    });
    fireEvent.click(screen.getByText("+ comment"));
    fireEvent.change(screen.getByTestId("slot-editor"), { target: { value: "   " } });
    expect(addAnchorAtBlock).not.toHaveBeenCalled();
    expect(addCommentStub).not.toHaveBeenCalled();
  });

  it("renders one row per editor block, not per markdown re-parse (editor is the source)", () => {
    // The editor reports a heading + a paragraph (two blocks) for `# Heading\nBody.` even with no
    // blank line between them — where a blank-line parse would see one. The column must follow the
    // editor's block list (ADR 0009), so two slots render and the marker binds to the second.
    renderColumn({
      fragmentContent: "# Heading\nBody.",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on body")] }),
      getBlocks: () => [
        { markerId: null, text: "Heading", top: 0, height: 0 },
        { markerId: "a", text: "Body.", top: 0, height: 0 },
      ],
    });
    expect(document.querySelector('[data-slot-block="0"]')).toBeTruthy();
    expect(document.querySelector('[data-slot-marker="a"]')).toBeTruthy();
    expect(screen.getByText("on body")).toBeTruthy();
  });

  it("anchors each comment at its block's measured top (absolute positioning)", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->\n\nSecond. <!--c:b-->",
      marginEditor: buildMarginEditor({
        comments: [comment("a", "on a"), comment("b", "on b")],
      }),
      getBlocks: () => [
        { markerId: "a", text: "First.", top: 0, height: 24 },
        { markerId: "b", text: "Second.", top: 80, height: 24 },
      ],
    });
    const rowB = document.querySelector('[data-slot-marker="b"]') as HTMLElement;
    expect(rowB.style.position).toBe("absolute");
    expect(rowB.style.top).toBe("80px");
  });

  it("clips an idle comment row to its block's height so a tall comment can't run into its neighbour", () => {
    renderColumn({
      fragmentContent: "Long. <!--c:a-->\n\nShort.",
      marginEditor: buildMarginEditor({ comments: [comment("a", "a tall comment body")] }),
      getBlocks: () => [
        { markerId: "a", text: "Long.", top: 0, height: 50 },
        { markerId: null, text: "Short.", top: 60, height: 40 },
      ],
    });
    const row = document.querySelector('[data-slot-marker="a"]') as HTMLElement;
    expect(row.style.overflow).toBe("hidden");
    expect(row.style.maxHeight).toBe("50px");
  });

  it("expand-all relaxes anchoring into a plain stacked column (no absolute tops)", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")] }),
      getBlocks: () => [{ markerId: "a", text: "First.", top: 30, height: 24 }],
    });
    fireEvent.click(screen.getByText("Expand all"));
    const row = document.querySelector('[data-slot-marker="a"]') as HTMLElement;
    expect(row.style.position).toBe("relative");
    expect(row.style.maxHeight).toBe("");
  });

  it("places notes at the bottom of the scroller, with no top toolbar", () => {
    renderColumn({ fragmentContent: "First.\n\nSecond." });
    const notes = screen.getByTestId("margin-notes");
    const scroll = screen.getByTestId("margin-scroll");
    const column = screen.getByTestId("margin-column");
    // Notes now scroll with the content, at the foot of the scroller (reached after the fragment text).
    expect(scroll.contains(notes)).toBe(true);
    // The column controls are a pinned footer below the scroller, not a top toolbar.
    const controls = screen.getByTestId("margin-controls");
    expect(scroll.contains(controls)).toBe(false);
    // The scroller is the column's first child — no chrome above it offsets the rows.
    expect(column.firstElementChild).toBe(scroll);
  });

  it("renders an idle comment as flowing text (top rule only) and lifts the active one onto an overlay", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")] }),
    });
    const row = document.querySelector('[data-slot-marker="a"]')!;
    // The attachment rule (coloured top border) shows when idle; no opaque box background.
    expect(row.className).toContain("border-t-border/40");
    expect(row.className).not.toContain("bg-background");
    // Activating the comment lifts it onto an opaque overlay (background + full border colour) above
    // its neighbours; the reserved transparent border means activation changes only colour, not layout.
    fireEvent.click(screen.getByText("on a"));
    const activeRow = document.querySelector('[data-slot-marker="a"]')!;
    expect(activeRow.className).toContain("bg-background");
    expect(activeRow.className).not.toContain("border-t-border/40");
  });

  it("delete on an active comment strips its marker and removes it (coordinated edit)", () => {
    const removeAnchor = vi.fn();
    const removeComment = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")], removeComment }),
      removeAnchor,
    });
    // Activate the comment, then delete it.
    fireEvent.click(screen.getByText("on a"));
    fireEvent.mouseDown(screen.getByLabelText("Remove comment"));
    expect(removeAnchor).toHaveBeenCalledWith("a");
    expect(removeComment).toHaveBeenCalledWith("a");
  });

  it("exposes the remove control on an idle comment (deletable without entering edit)", () => {
    const removeAnchor = vi.fn();
    const removeComment = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")], removeComment }),
      removeAnchor,
    });
    // The remove × is present (in the gutter) without activating the comment first.
    fireEvent.mouseDown(screen.getByLabelText("Remove comment"));
    expect(removeAnchor).toHaveBeenCalledWith("a");
    expect(removeComment).toHaveBeenCalledWith("a");
  });

  it("removes an emptied comment on blur instead of leaving a blank '(empty)' slot", () => {
    const removeAnchor = vi.fn();
    const removeComment = vi.fn();
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      // The comment body is already empty (e.g. the writer cleared it).
      marginEditor: buildMarginEditor({ comments: [comment("a", "")], removeComment }),
      removeAnchor,
    });
    // No "(empty)" placeholder is rendered.
    expect(screen.queryByText("(empty)")).toBeNull();
    // Activate the (empty) comment via its body button, then blur — it is removed, not kept blank.
    const row = document.querySelector('[data-slot-marker="a"]') as HTMLElement;
    const bodyButton = within(row)
      .getAllByRole("button")
      .find((node) => node.getAttribute("aria-label") !== "Remove comment")!;
    fireEvent.click(bodyButton);
    fireEvent.blur(screen.getByTestId("slot-editor"));
    expect(removeAnchor).toHaveBeenCalledWith("a");
    expect(removeComment).toHaveBeenCalledWith("a");
  });
});
