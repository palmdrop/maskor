import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Comment } from "@api/generated/maskorAPI.schemas";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import type { EditorBlock } from "@components/prose-editor";
import { enumerateBlocks } from "@lib/margins/column";
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

const renderColumn = (props: Partial<Parameters<typeof MarginColumn>[0]> = {}) => {
  const fragmentContent = props.fragmentContent ?? "";
  return render(
    <MarginColumn
      projectId="project-1"
      marginEditor={buildMarginEditor()}
      fragmentContent={fragmentContent}
      mode="rich"
      fontSize={16}
      onSave={vi.fn()}
      insertMarkerInBlock={vi.fn()}
      stripMarker={vi.fn()}
      revealMarker={vi.fn()}
      focusMarkerBlock={vi.fn()}
      getScrollElement={() => null}
      getBlocks={() => blocksFromContent(fragmentContent)}
      setBlockSpacers={vi.fn()}
      setEditorTopPadding={vi.fn()}
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

  it("pushes a document-side spacer when a comment is taller than its block slot", () => {
    // jsdom reports zero geometry; stub each row's height by its data-row-index so the alignment pass
    // has something to measure. Row 0 (the long comment) renders 200px against a 60px slot → a 140px
    // spacer pushes block 1 down; the short last row needs none.
    const rect = (height: number) =>
      ({
        height,
        top: 0,
        left: 0,
        right: 0,
        bottom: height,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return rect(this.getAttribute("data-row-index") === "0" ? 200 : 40);
      });
    const setBlockSpacers = vi.fn();
    try {
      renderColumn({
        fragmentContent: "Long. <!--c:a-->\n\nShort.",
        marginEditor: buildMarginEditor({ comments: [comment("a", "a very long comment body")] }),
        getBlocks: () => [
          { markerId: "a", text: "Long.", top: 0, height: 50 },
          { markerId: null, text: "Short.", top: 60, height: 40 },
        ],
        setBlockSpacers,
      });
    } finally {
      spy.mockRestore();
    }
    expect(setBlockSpacers).toHaveBeenCalled();
    expect(setBlockSpacers.mock.calls.at(-1)![0]).toEqual([140, 0]);
  });

  it("keeps the notes header out of the scrolled flow (row 0 aligns with block 0)", () => {
    renderColumn({ fragmentContent: "First.\n\nSecond." });
    const notes = screen.getByTestId("margin-notes");
    const scroll = screen.getByTestId("margin-scroll");
    // The notes header is a sibling above the scroller, never nested inside it.
    expect(scroll.contains(notes)).toBe(false);
  });

  it("pads the editor's top to close the chrome gap (notes header offset)", () => {
    // The margin scroller sits 40px below the editor scroller (its extra chrome — notes header etc.).
    // The column measures that gap and asks the editor to pad its content down to align row 0.
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const top = this.getAttribute("data-testid") === "margin-scroll" ? 140 : 0;
        return {
          height: 0,
          top,
          left: 0,
          right: 0,
          bottom: top,
          width: 0,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const editorScroll = {
      getBoundingClientRect: () => ({ top: 100 }) as DOMRect,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const setEditorTopPadding = vi.fn();
    try {
      renderColumn({
        fragmentContent: "First.",
        getScrollElement: () => editorScroll,
        setEditorTopPadding,
      });
    } finally {
      spy.mockRestore();
    }
    expect(setEditorTopPadding).toHaveBeenCalledWith(40);
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
