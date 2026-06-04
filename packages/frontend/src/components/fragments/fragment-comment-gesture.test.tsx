import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type Ref, type ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { allCommands } from "@lib/commands/catalog";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import type { MarginColumnHandle } from "@components/margins/margin-column";

// The gesture is driven through the REAL command system (palette / vim hotkey / button all route to
// `margin:comment-block`). It is now a *jump* to the paragraph's margin slot — no marker injection,
// no stub creation (creation is implicit: typing in the slot conjures the comment).

const getCurrentBlockSpy = vi.fn(() => ({
  text: "the cursor block",
  markerId: "m1" as string | null,
  index: 2,
}));
const shellSaveSpy = vi.fn();
const focusSlotSpy = vi.fn();
const addCommentStubSpy = vi.fn();
const marginSaveSpy = vi.fn();

type ShellProps = { banner?: ReactNode; rightPanel?: ReactNode };
type ShellHandle = {
  save: () => Promise<void>;
  getSelection: () => { text: string; isEmpty: boolean };
  getCurrentBlock: () => { text: string; markerId: string | null; index: number } | null;
  revealAnchor: (markerId: string) => void;
  restoreFromServer: () => void;
};

vi.mock("@components/entity-editor-shell", () => ({
  EntityEditorShell: forwardRef<ShellHandle, ShellProps>(function ShellStub(
    { banner, rightPanel }: ShellProps,
    ref: Ref<ShellHandle>,
  ) {
    useImperativeHandle(ref, () => ({
      save: shellSaveSpy as unknown as () => Promise<void>,
      getSelection: () => ({ text: "", isEmpty: true }),
      getCurrentBlock: getCurrentBlockSpy,
      revealAnchor: vi.fn(),
      restoreFromServer: vi.fn(),
    }));
    return (
      <div data-testid="shell-stub">
        {banner}
        {rightPanel}
      </div>
    );
  }),
}));

// Column stub: exposes the "+ Comment" affordance (calls onCommentBlock) and a focusSlot spy ref.
vi.mock("@components/margins/margin-column", () => ({
  MarginColumn: forwardRef<MarginColumnHandle, { onCommentBlock?: () => void }>(
    function MarginColumnStub({ onCommentBlock }, ref: Ref<MarginColumnHandle>) {
      useImperativeHandle(ref, () => ({ focusSlot: focusSlotSpy }));
      return (
        <button type="button" onClick={onCommentBlock}>
          + Comment
        </button>
      );
    },
  ),
}));

const marginEditor: UseMarginEditorResult = {
  notes: "",
  comments: [],
  exists: false,
  isLoading: false,
  isDirty: false,
  isSaving: false,
  setNotes: vi.fn(),
  updateCommentBody: vi.fn(),
  addCommentStub: addCommentStubSpy,
  removeComment: vi.fn(),
  save: marginSaveSpy,
  revertToServer: vi.fn(),
  serialize: vi.fn(() => ""),
  serializedContent: "",
  serializedServer: "",
  applySerialized: vi.fn(),
};

vi.mock("@hooks/useMarginEditor", () => ({
  useMarginEditor: () => marginEditor,
}));

vi.mock("@hooks/useEntityContentSwap", () => ({
  useEntityContentSwap: () => ({ recovery: null, clear: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

vi.mock("@api/generated/fragments/fragments", () => ({
  useGetFragment: () => ({
    data: { status: 200, data: { key: "frag", content: "body", isDiscarded: false } },
    isLoading: false,
    isError: false,
  }),
  useUpdateFragment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDiscardFragment: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreFragment: () => ({ mutate: vi.fn(), isPending: false }),
  getGetFragmentQueryKey: () => ["fragment"],
  getListFragmentsQueryKey: () => ["fragments"],
}));

vi.mock("@api/generated/projects/projects", () => ({
  useGetProject: () => ({
    data: { status: 200, data: { advanced: { showFragmentStats: false }, editor: {} } },
  }),
}));

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: () => ({ data: { status: 200, data: { sequences: [] } } }),
}));

vi.mock("@api/generated/stats/stats", () => ({
  getGetFragmentStatsQueryKey: () => ["stats"],
}));

vi.mock("@api/action-log", () => ({
  useInvalidateActionLog: () => vi.fn(),
}));

import { FragmentEditor } from "./fragment-editor";

beforeEach(() => {
  getCurrentBlockSpy.mockClear();
  shellSaveSpy.mockClear();
  focusSlotSpy.mockClear();
  addCommentStubSpy.mockClear();
  marginSaveSpy.mockClear();
});

const renderEditor = () =>
  render(
    <CommandsProvider>
      <FragmentEditor projectId="project-1" fragmentId="fragment-1" />
    </CommandsProvider>,
  );

describe("comment gesture (margin:comment-block)", () => {
  it("is one command with a hotkey — the shared palette / vim-binding entry point", () => {
    const def = allCommands.find((command) => command.id === "margin:comment-block");
    expect(def).toBeDefined();
    expect(def?.hotkey).toBe("mod+shift+m");
  });

  it("jumps to the paragraph's slot — no marker injection, no stub, no save", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Comment" }));

    // Jump to the current block's slot (its comment if any, else the empty slot).
    expect(focusSlotSpy).toHaveBeenCalledWith({ index: 2, markerId: "m1" });

    // Creation is implicit now: the gesture itself seeds no stub.
    expect(addCommentStubSpy).not.toHaveBeenCalled();

    // No premature persistence.
    expect(shellSaveSpy).not.toHaveBeenCalled();
    expect(marginSaveSpy).not.toHaveBeenCalled();
  });
});
