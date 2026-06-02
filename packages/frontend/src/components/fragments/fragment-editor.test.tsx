import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle, type Ref, type ReactNode } from "react";
import type { SwapRecovery } from "@hooks/useEntityContentSwap";
import type { UseMarginEditorResult } from "@hooks/useMarginEditor";

// --- Controllable mock state ---

const restoreFromServerSpy = vi.fn();
const marginClearSpy = vi.fn();
const marginRevertSpy = vi.fn();

let fragmentRecovery: SwapRecovery | null = null;
let marginRecovery: SwapRecovery | null = null;
let capturedOnRecoveryChange: ((recovery: { at: Date } | null) => void) | undefined;

// EntityEditorShell stub: renders the `banner` prop (where the linked-pair recovery banner lives),
// reports the fragment recovery up via onRecoveryChange, and exposes restoreFromServer on its ref.
type ShellProps = {
  banner?: ReactNode;
  onRecoveryChange?: (recovery: { at: Date } | null) => void;
};
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
    { banner, onRecoveryChange }: ShellProps,
    ref: Ref<ShellHandle>,
  ) {
    capturedOnRecoveryChange = onRecoveryChange;
    useEffect(() => {
      onRecoveryChange?.(fragmentRecovery ? { at: fragmentRecovery.at } : null);
    }, [onRecoveryChange]);
    useImperativeHandle(ref, () => ({
      save: vi.fn(),
      getSelection: () => ({ text: "", isEmpty: true }),
      getCurrentBlock: () => null,
      appendCommentMarker: vi.fn(),
      revealCommentMarker: vi.fn(),
      restoreFromServer: restoreFromServerSpy,
    }));
    return <div data-testid="shell-stub">{banner}</div>;
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
  save: vi.fn(),
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

vi.mock("../../lib/commands/useCommands", () => ({
  useCommands: () => ({ run: vi.fn() }),
}));

vi.mock("../../lib/commands/useCommandScope", () => ({
  useCommandScope: vi.fn(),
}));

import { FragmentEditor } from "./fragment-editor";

const renderEditor = () => render(<FragmentEditor projectId="project-1" fragmentId="fragment-1" />);

beforeEach(() => {
  restoreFromServerSpy.mockReset();
  marginClearSpy.mockReset();
  marginRevertSpy.mockReset();
  fragmentRecovery = null;
  marginRecovery = null;
  capturedOnRecoveryChange = undefined;
});

const at = new Date("2026-06-02T10:00:00.000Z");

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
