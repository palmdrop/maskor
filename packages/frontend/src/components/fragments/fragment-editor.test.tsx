import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle, type Ref, type ReactNode } from "react";
import type { SwapRecovery } from "@hooks/useEntityContentSwap";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";

// --- Controllable mock state ---

const restoreFromServerSpy = vi.fn();
const marginClearSpy = vi.fn();
const marginRevertSpy = vi.fn();
const marginSaveSpy = vi.fn(() => Promise.resolve());
const updateFragmentSpy = vi.fn(() => Promise.resolve({ status: 200, data: {} }));

let fragmentRecovery: SwapRecovery | null = null;
let marginRecovery: SwapRecovery | null = null;
// Controllable sequence bundle so the placement-picker filter (import-sequences
// excluded) is testable.
let sequenceListData: Array<Record<string, unknown>> = [];
let capturedOnRecoveryChange: ((recovery: { at: Date } | null) => void) | undefined;
// Captured from the shell stub so the coupled-save path (margins-4 Phase 4) is testable.
let capturedIsDirty: boolean | undefined;
let capturedOnProseChange: (() => void) | undefined;
let capturedOnContentSave: ((content: string) => Promise<unknown>) | undefined;

// EntityEditorShell stub: renders the `banner` prop (where the linked-pair recovery banner lives),
// reports the fragment recovery up via onRecoveryChange, and exposes restoreFromServer on its ref.
type ShellProps = {
  banner?: ReactNode;
  rightPanel?: ReactNode;
  onRecoveryChange?: (recovery: { at: Date } | null) => void;
  isDirty?: boolean;
  onProseChange?: () => void;
  onContentSave?: (content: string) => Promise<unknown>;
};
type ShellHandle = {
  save: () => Promise<void>;
  getSelection: () => { text: string; isEmpty: boolean };
  getCurrentBlock: () => { text: string } | null;
  revealAnchor: (markerId: string) => void;
  restoreFromServer: () => void;
};

vi.mock("@components/entity-editor-shell", () => ({
  EntityEditorShell: forwardRef<ShellHandle, ShellProps>(function ShellStub(
    { banner, rightPanel, onRecoveryChange, isDirty, onProseChange, onContentSave }: ShellProps,
    ref: Ref<ShellHandle>,
  ) {
    capturedOnRecoveryChange = onRecoveryChange;
    capturedIsDirty = isDirty;
    capturedOnProseChange = onProseChange;
    capturedOnContentSave = onContentSave;
    useEffect(() => {
      onRecoveryChange?.(fragmentRecovery ? { at: fragmentRecovery.at } : null);
    }, [onRecoveryChange]);
    useImperativeHandle(ref, () => ({
      save: vi.fn(),
      getSelection: () => ({ text: "", isEmpty: true }),
      getCurrentBlock: () => null,
      revealAnchor: vi.fn(),
      restoreFromServer: restoreFromServerSpy,
    }));
    return (
      <div data-testid="shell-stub">
        {banner}
        {rightPanel}
      </div>
    );
  }),
}));

vi.mock("@components/margins/margin-column", () => ({
  MarginColumn: forwardRef(function MarginColumnStub(_props: unknown, _ref: Ref<unknown>) {
    return <div data-testid="margin-column-stub" />;
  }),
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
  addCommentStub: vi.fn(),
  removeComment: vi.fn(),
  save: marginSaveSpy,
  revertToServer: marginRevertSpy,
  serialize: vi.fn(() => ""),
  serializedContent: "",
  serializedServer: "",
  applySerialized: vi.fn(),
};

vi.mock("@hooks/useMarginEditor", () => ({
  useMarginEditor: () => marginEditor,
}));

vi.mock("@hooks/useEntityContentSwap", () => ({
  useEntityContentSwap: () => ({ recovery: marginRecovery, clear: marginClearSpy }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@api/generated/fragments/fragments", () => ({
  useGetFragment: () => ({
    data: { status: 200, data: { key: "frag", content: "body", isDiscarded: false } },
    isLoading: false,
    isError: false,
  }),
  useUpdateFragment: () => ({ mutateAsync: updateFragmentSpy, isPending: false }),
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
  useListSequences: () => ({ data: { status: 200, data: { sequences: sequenceListData } } }),
}));

vi.mock("@api/generated/stats/stats", () => ({
  getGetFragmentStatsQueryKey: () => ["stats"],
}));

vi.mock("@api/action-log", () => ({
  useInvalidateActionLog: () => vi.fn(),
  getActionLogQueryKey: (projectId: string) => ["action-log", projectId],
}));

vi.mock("../../lib/commands/useCommands", () => ({
  useCommands: () => ({ run: vi.fn() }),
}));

vi.mock("../../lib/commands/useCommandScope", () => ({
  useCommandScope: vi.fn(),
}));

import { FragmentEditor } from "./fragment-editor";
import { useCommandScope } from "../../lib/commands/useCommandScope";

const renderEditor = (props?: { showMargin?: boolean }) =>
  render(<FragmentEditor projectId="project-1" fragmentId="fragment-1" {...props} />);

beforeEach(() => {
  restoreFromServerSpy.mockReset();
  marginClearSpy.mockReset();
  marginRevertSpy.mockReset();
  marginSaveSpy.mockClear();
  updateFragmentSpy.mockClear();
  fragmentRecovery = null;
  marginRecovery = null;
  marginEditor.isDirty = false;
  capturedOnRecoveryChange = undefined;
  capturedIsDirty = undefined;
  capturedOnProseChange = undefined;
  capturedOnContentSave = undefined;
  sequenceListData = [];
});

const at = new Date("2026-06-02T10:00:00.000Z");

const makeSequenceListEntry = (overrides: Record<string, unknown>) => ({
  isMain: false,
  active: true,
  projectUuid: "project-1",
  sections: [],
  ...overrides,
});

describe("FragmentEditor placement picker", () => {
  it("excludes import-sequences (origin set) from the place-in-sequence picker", () => {
    sequenceListData = [
      makeSequenceListEntry({ uuid: "seq-writable", name: "Working", isMain: true }),
      makeSequenceListEntry({
        uuid: "seq-import",
        name: "Imported",
        active: false,
        origin: {
          fileName: "draft.md",
          archivePath: ".maskor/imports/draft.md",
          format: "markdown",
          importedAt: "2026-06-13T00:00:00.000Z",
        },
      }),
    ];
    renderEditor();

    const publishedContext = vi
      .mocked(useCommandScope)
      .mock.calls.map((call) => call[1] as Record<string, unknown> | undefined)
      .find((context) => context && "sequences" in context);
    const sequences = (publishedContext as { sequences: Array<{ uuid: string }> }).sequences;

    expect(sequences.map((sequence) => sequence.uuid)).toEqual(["seq-writable"]);
  });
});

describe("FragmentEditor linked swap pair", () => {
  it("shows no recovery banner when neither side has unsaved edits", () => {
    renderEditor();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a single banner when only the Margin has a recovered buffer", () => {
    marginRecovery = { content: "{}", at };
    renderEditor();
    const banners = screen.queryAllByRole("status");
    expect(banners).toHaveLength(1);
  });

  it("shows a single banner when only the fragment has a recovered buffer", () => {
    fragmentRecovery = { content: "body", at };
    renderEditor();
    const banners = screen.queryAllByRole("status");
    expect(banners).toHaveLength(1);
  });

  it("shows exactly one banner — not two — when both sides have recovered buffers", () => {
    fragmentRecovery = { content: "body", at };
    marginRecovery = { content: "{}", at: new Date("2026-06-02T10:05:00.000Z") };
    renderEditor();
    expect(screen.queryAllByRole("status")).toHaveLength(1);
  });

  it("restores both fragment and Margin atomically from the single banner", () => {
    fragmentRecovery = { content: "body", at };
    marginRecovery = { content: "{}", at };
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restore from server" }));
    expect(restoreFromServerSpy).toHaveBeenCalledTimes(1);
    expect(marginRevertSpy).toHaveBeenCalledTimes(1);
    expect(marginClearSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the banner after the fragment recovery is reported as resolved", () => {
    fragmentRecovery = { content: "body", at };
    renderEditor();
    expect(screen.queryAllByRole("status")).toHaveLength(1);
    // Simulate the shell reporting the fragment swap cleared (e.g. after restore/ save).
    act(() => capturedOnRecoveryChange?.(null));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("FragmentEditor coupled save (margins-4 Phase 4)", () => {
  it("a margin-only edit dirties the shell so the editor Save is enabled", () => {
    marginEditor.isDirty = true;
    renderEditor();
    expect(capturedIsDirty).toBe(true);
  });

  it("a clean margin and clean prose leave the shell not dirty", () => {
    renderEditor();
    expect(capturedIsDirty).toBe(false);
  });

  it("the editor save persists the fragment and the margin together when both are dirty", async () => {
    marginEditor.isDirty = true;
    renderEditor();
    // Dirty the prose so the fragment side of the coupled save runs.
    act(() => capturedOnProseChange?.());
    await act(async () => {
      await capturedOnContentSave?.("new body");
    });
    expect(updateFragmentSpy).toHaveBeenCalledTimes(1);
    expect(marginSaveSpy).toHaveBeenCalledTimes(1);
    expect(marginClearSpy).toHaveBeenCalledTimes(1);
  });

  it("a margin-only save flushes the margin without re-writing the unchanged fragment", async () => {
    marginEditor.isDirty = true;
    renderEditor();
    await act(async () => {
      await capturedOnContentSave?.("body");
    });
    expect(updateFragmentSpy).not.toHaveBeenCalled();
    expect(marginSaveSpy).toHaveBeenCalledTimes(1);
  });
});

describe("FragmentEditor showMargin (inline overlay suppression — ADR 0013)", () => {
  it("renders the Margin column by default", () => {
    renderEditor();
    expect(screen.getByTestId("margin-column-stub")).toBeInTheDocument();
  });

  it("suppresses the Margin column when showMargin is false (the inline overlay)", () => {
    renderEditor({ showMargin: false });
    expect(screen.queryByTestId("margin-column-stub")).toBeNull();
  });
});
