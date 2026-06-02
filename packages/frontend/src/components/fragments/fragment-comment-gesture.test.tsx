import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type Ref, type ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { allCommands } from "@lib/commands/catalog";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";
import type { MarginPanelHandle } from "@components/margins/margin-panel";

// The gesture is driven through the REAL command system (palette / vim hotkey / button all route to
// `margin:comment-block`). Only the editor surfaces and data hooks are stubbed.

const getCurrentBlockSpy = vi.fn(() => ({ text: "the cursor block" }));
const appendCommentMarkerSpy = vi.fn();
const shellSaveSpy = vi.fn();
const focusCommentSpy = vi.fn();
const addCommentStubSpy = vi.fn();
const marginSaveSpy = vi.fn();

type ShellProps = { banner?: ReactNode; rightPanel?: ReactNode };
type ShellHandle = {
  save: () => Promise<void>;
  getSelection: () => { text: string; isEmpty: boolean };
  getCurrentBlock: () => { text: string } | null;
  appendCommentMarker: (markerId: string) => void;
  revealCommentMarker: (markerId: string) => void;
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
      appendCommentMarker: appendCommentMarkerSpy,
      revealCommentMarker: vi.fn(),
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

// Panel stub: exposes the "+ Comment" affordance (calls onCommentBlock) and a focusComment spy ref.
vi.mock("@components/margins/margin-panel", () => ({
  MarginPanel: forwardRef<MarginPanelHandle, { onCommentBlock?: () => void }>(
    function MarginPanelStub({ onCommentBlock }, ref: Ref<MarginPanelHandle>) {
      useImperativeHandle(ref, () => ({ focusComment: focusCommentSpy }));
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
    data: { status: 200, data: { advanced: { showFragmentStats: false } } },
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
  appendCommentMarkerSpy.mockClear();
  shellSaveSpy.mockClear();
  focusCommentSpy.mockClear();
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

  it("injects a marker, seeds a stub with the block excerpt, and moves focus — without saving", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Comment" }));

    // Marker injected into the fragment buffer.
    expect(appendCommentMarkerSpy).toHaveBeenCalledTimes(1);
    const markerId = appendCommentMarkerSpy.mock.calls[0]![0] as string;
    expect(markerId).toBeTruthy();

    // Stub created in the Margin, seeded with the block excerpt, bound to the same marker.
    expect(addCommentStubSpy).toHaveBeenCalledWith({
      markerId,
      excerpt: "the cursor block",
      body: "",
    });

    // Focus moved to the Margin panel's comment.
    expect(focusCommentSpy).toHaveBeenCalledWith(markerId);

    // No premature persistence — neither buffer is force-flushed.
    expect(shellSaveSpy).not.toHaveBeenCalled();
    expect(marginSaveSpy).not.toHaveBeenCalled();
  });
});
