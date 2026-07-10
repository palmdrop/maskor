import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle, type Ref, type ReactNode } from "react";
import type { SwapRecovery } from "@hooks/useEntityContentSwap";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";

// --- Controllable mock state ---

const restoreFromServerSpy = vi.fn();
const restoreBackupSpy = vi.fn();
const marginClearSpy = vi.fn();
const marginRevertSpy = vi.fn();
const marginSaveSpy = vi.fn(() => Promise.resolve());
const updateFragmentSpy = vi.fn(() => Promise.resolve({ status: 200, data: {} }));
const invalidateSequencesSpy = vi.fn();
// mutateAsync stubs that honor react-query's (variables, { onSuccess }) shape so
// the discard/restore onSuccess invalidations actually run in the test.
const discardFragmentSpy = vi.fn(
  (_variables: unknown, options?: { onSuccess?: () => void }): Promise<void> => {
    options?.onSuccess?.();
    return Promise.resolve();
  },
);
const restoreFragmentSpy = vi.fn(
  (_variables: unknown, options?: { onSuccess?: () => void }): Promise<void> => {
    options?.onSuccess?.();
    return Promise.resolve();
  },
);

let fragmentRecovery: SwapRecovery | null = null;
let marginRecovery: SwapRecovery | null = null;
// Controllable sequence bundle so the placement-picker filter (import-sequences
// excluded) is testable.
let sequenceListData: Array<Record<string, unknown>> = [];
let capturedOnRecoveryChange:
  | ((recovery: { at: Date; isConflict: boolean } | null) => void)
  | undefined;
// Captured from the shell stub so the coupled-save path (margins-4 Phase 4) is testable.
let capturedIsDirty: boolean | undefined;
let capturedOnProseChange: (() => void) | undefined;
let capturedOnContentSave: ((content: string) => Promise<unknown>) | undefined;

// EntityEditorShell stub: renders the `banner` prop (where the linked-pair recovery banner lives),
// reports the fragment recovery up via onRecoveryChange, and exposes restoreFromServer on its ref.
type ShellProps = {
  banner?: ReactNode;
  rightPanel?: ReactNode;
  onRecoveryChange?: (recovery: { at: Date; isConflict: boolean } | null) => void;
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
  restoreBackup: () => void;
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
      onRecoveryChange?.(
        fragmentRecovery
          ? { at: fragmentRecovery.at, isConflict: fragmentRecovery.isConflict }
          : null,
      );
    }, [onRecoveryChange]);
    useImperativeHandle(ref, () => ({
      save: vi.fn(),
      getSelection: () => ({ text: "", isEmpty: true }),
      getCurrentBlock: () => null,
      revealAnchor: vi.fn(),
      restoreFromServer: restoreFromServerSpy,
      restoreBackup: restoreBackupSpy,
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
  useDiscardFragment: () => ({ mutateAsync: discardFragmentSpy, isPending: false }),
  useRestoreFragment: () => ({ mutateAsync: restoreFragmentSpy, isPending: false }),
  getGetFragmentQueryKey: () => ["fragment"],
  getListFragmentsQueryKey: () => ["fragments"],
  getListFragmentSummariesQueryKey: () => ["fragments", "summaries"],
}));

vi.mock("@api/generated/projects/projects", () => ({
  useGetProject: () => ({
    data: { status: 200, data: { advanced: { showFragmentStats: false } } },
  }),
}));

// The Margin document-link plumbing reads the four entity lists; stub it so the editor test doesn't
// need to mock every list hook (margin-column itself is stubbed above).
vi.mock("@lib/document-links/useDocumentLinks", () => ({
  useDocumentLinks: () => ({
    lookups: { fragments: new Map(), notes: new Map(), references: new Map(), aspects: new Map() },
    entities: [],
    resolve: vi.fn(),
    navigateToLink: vi.fn(),
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

vi.mock("@lib/sequences/useInvalidateSequences", () => ({
  useInvalidateSequences: () => invalidateSequencesSpy,
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
  restoreBackupSpy.mockReset();
  marginClearSpy.mockReset();
  marginRevertSpy.mockReset();
  marginSaveSpy.mockClear();
  updateFragmentSpy.mockClear();
  invalidateSequencesSpy.mockClear();
  discardFragmentSpy.mockClear();
  restoreFragmentSpy.mockClear();
  vi.mocked(marginEditor.applySerialized).mockClear();
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

describe("FragmentEditor discard/restore sequence-cache coherence", () => {
  const findEditorScopeContext = () =>
    vi
      .mocked(useCommandScope)
      .mock.calls.map((call) => call[1] as Record<string, unknown> | undefined)
      .find((context) => context && "discard" in context) as
      | { discard: () => Promise<void>; restore: () => Promise<void> }
      | undefined;

  it("invalidates the sequence caches when the fragment is discarded", async () => {
    renderEditor();
    const context = findEditorScopeContext();
    expect(context).toBeDefined();

    await act(async () => {
      await context!.discard();
    });

    // The backend unplaces the fragment from every sequence on discard; without
    // this invalidation the sidebar/overview keep rendering the stale placement.
    expect(discardFragmentSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSequencesSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidates the sequence caches when the fragment is restored", async () => {
    renderEditor();
    const context = findEditorScopeContext();
    expect(context).toBeDefined();

    await act(async () => {
      await context!.restore();
    });

    expect(restoreFragmentSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSequencesSpy).toHaveBeenCalledTimes(1);
  });
});

describe("FragmentEditor linked swap pair", () => {
  it("shows no recovery banner when neither side has unsaved edits", () => {
    renderEditor();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a single banner when only the Margin has a recovered buffer", () => {
    marginRecovery = { content: "{}", at, isConflict: false };
    renderEditor();
    const banners = screen.queryAllByRole("status");
    expect(banners).toHaveLength(1);
  });

  it("shows a single banner when only the fragment has a recovered buffer", () => {
    fragmentRecovery = { content: "body", at, isConflict: false };
    renderEditor();
    const banners = screen.queryAllByRole("status");
    expect(banners).toHaveLength(1);
  });

  it("shows exactly one banner — not two — when both sides have recovered buffers", () => {
    fragmentRecovery = { content: "body", at, isConflict: false };
    marginRecovery = { content: "{}", at: new Date("2026-06-02T10:05:00.000Z"), isConflict: false };
    renderEditor();
    expect(screen.queryAllByRole("status")).toHaveLength(1);
  });

  it("restores both fragment and Margin atomically from the single banner", () => {
    fragmentRecovery = { content: "body", at, isConflict: false };
    marginRecovery = { content: "{}", at, isConflict: false };
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restore from server" }));
    expect(restoreFromServerSpy).toHaveBeenCalledTimes(1);
    expect(marginRevertSpy).toHaveBeenCalledTimes(1);
    expect(marginClearSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the banner after the fragment recovery is reported as resolved", () => {
    fragmentRecovery = { content: "body", at, isConflict: false };
    renderEditor();
    expect(screen.queryAllByRole("status")).toHaveLength(1);
    // Simulate the shell reporting the fragment swap cleared (e.g. after restore/ save).
    act(() => capturedOnRecoveryChange?.(null));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("FragmentEditor linked swap pair — conflicting backup (multi-tab-swap-hardening)", () => {
  it("shows the conflict banner instead of auto-restoring when either side conflicts", () => {
    // The margin's backup was written against a server version that has since advanced.
    marginRecovery = { content: "{}", at, isConflict: true };
    renderEditor();

    // A held-back conflicting Margin backup is NOT auto-applied.
    expect(marginEditor.applySerialized).not.toHaveBeenCalled();
    // The conflict variant renders (role alert), not the auto-restored variant (role status).
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/backup conflict/i);
  });

  it("a fragment-side conflict also makes the whole pair conflict", () => {
    fragmentRecovery = { content: "body", at, isConflict: true };
    renderEditor();
    expect(screen.getByRole("alert").textContent).toMatch(/backup conflict/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Restore backup applies both sides together and hides the banner", () => {
    fragmentRecovery = { content: "body", at, isConflict: true };
    marginRecovery = { content: "{}", at, isConflict: true };
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Restore backup" }));

    expect(restoreBackupSpy).toHaveBeenCalledTimes(1);
    expect(marginEditor.applySerialized).toHaveBeenCalledWith("{}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Keep server version restores both sides from the server and clears both swaps", () => {
    fragmentRecovery = { content: "body", at, isConflict: true };
    marginRecovery = { content: "{}", at, isConflict: true };
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Keep server version" }));

    expect(restoreFromServerSpy).toHaveBeenCalledTimes(1);
    expect(marginRevertSpy).toHaveBeenCalledTimes(1);
    expect(marginClearSpy).toHaveBeenCalledTimes(1);
    expect(marginEditor.applySerialized).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
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

describe("FragmentEditor notes gutter tab (margin-orphan-and-notes-tab Phase 2)", () => {
  it("renders a Notes gutter tab beside Margin and Aspects", () => {
    renderEditor();
    // The three gutter tab triggers.
    expect(screen.getByRole("tab", { name: "Margin" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Aspects" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
  });

  it("mounts the notes tab wired to the margin editor (notes surface, coupled save)", () => {
    marginEditor.notes = "a structural thought";
    renderEditor();
    // Force-mounted (hidden when inactive), so the notes body is in the DOM bound to marginEditor.
    const notesTab = screen.getByTestId("margin-notes-tab");
    expect(notesTab.textContent).toContain("a structural thought");
    marginEditor.notes = "";
  });

  it("does not render the notes tab when the Margin is suppressed (inline overlay)", () => {
    renderEditor({ showMargin: false });
    expect(screen.queryByTestId("margin-notes-tab")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Notes" })).toBeNull();
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
