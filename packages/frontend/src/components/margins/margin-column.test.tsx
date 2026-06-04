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
  MARGIN_LINE_HEIGHT: 1.75,
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

  it("freezes the document-side spacers while a slot is active, reconciling on blur (margins-4 #6)", () => {
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
    // Mutable per-row heights so the active comment can "grow" mid-test.
    const rowHeights: Record<string, number> = { "0": 200 };
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const index = this.getAttribute("data-row-index");
        return rect(index && rowHeights[index] !== undefined ? rowHeights[index]! : 40);
      });
    const setBlockSpacers = vi.fn();
    const getBlocks = (): EditorBlock[] => [
      { markerId: "a", text: "Long.", top: 0, height: 50 },
      { markerId: null, text: "Short.", top: 60, height: 40 },
    ];
    const baseProps = {
      projectId: "project-1",
      fragmentContent: "Long. <!--c:a-->\n\nShort.",
      mode: "rich" as const,
      fontSize: 16,
      insertMarkerInBlock: vi.fn(),
      stripMarker: vi.fn(),
      revealMarker: vi.fn(),
      focusMarkerBlock: vi.fn(),
      getScrollElement: () => null,
      getBlocks,
      setBlockSpacers,
      setEditorTopPadding: vi.fn(),
    };
    try {
      const view = render(
        <MarginColumn
          {...baseProps}
          marginEditor={buildMarginEditor({ comments: [comment("a", "body")] })}
        />,
      );
      // Idle (no active slot): the 200px comment over a 60px slot pushes a 140px spacer on block 0.
      expect(setBlockSpacers.mock.calls.at(-1)![0]).toEqual([140, 0]);
      setBlockSpacers.mockClear();
      // Activate the comment, then grow its measured height (as if typing).
      fireEvent.click(screen.getByText("body"));
      rowHeights["0"] = 500;
      view.rerender(
        <MarginColumn
          {...baseProps}
          marginEditor={buildMarginEditor({ comments: [comment("a", "body grown")] })}
        />,
      );
      // Frozen while editing: the document-side spacer is not re-pushed to reflect the growth.
      expect(setBlockSpacers).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("places notes at the bottom of the scroller, with no top toolbar (margins-4 #3, #4)", () => {
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

  it("renders an idle comment as flowing text (top rule only) and boxes only the active one", () => {
    renderColumn({
      fragmentContent: "First. <!--c:a-->",
      marginEditor: buildMarginEditor({ comments: [comment("a", "on a")] }),
    });
    const row = document.querySelector('[data-slot-marker="a"]')!;
    // The attachment rule (coloured top border) shows when idle; the box background only while editing.
    expect(row.className).toContain("border-t-border/40");
    expect(row.className).not.toContain("bg-muted/20");
    // Activating the comment boxes it (background + full border colour); the reserved transparent
    // border means activation changes only colour, not layout.
    fireEvent.click(screen.getByText("on a"));
    const activeRow = document.querySelector('[data-slot-marker="a"]')!;
    expect(activeRow.className).toContain("bg-muted/20");
    expect(activeRow.className).not.toContain("border-t-border/40");
  });

  it("clips an idle/collapsed comment row to its block height so it adds no document spacer (margins-4 #4, #6)", () => {
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
    try {
      renderColumn({
        fragmentContent: "Long. <!--c:a-->\n\nShort.",
        marginEditor: buildMarginEditor({ comments: [comment("a", "a tall comment body")] }),
        getBlocks: () => [
          { markerId: "a", text: "Long.", top: 0, height: 50 },
          { markerId: null, text: "Short.", top: 60, height: 40 },
        ],
      });
      // The block-0 slot height is 60px (tops 0→60); the idle comment row is clipped to it.
      const row = document.querySelector('[data-slot-marker="a"]') as HTMLElement;
      expect(row.style.overflow).toBe("hidden");
      expect(row.style.maxHeight).toBe("60px");
    } finally {
      spy.mockRestore();
    }
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
