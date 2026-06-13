import { describe, it, expect, vi } from "vitest";
import { overviewCommands, type OverviewContext } from "../overview";
import { sequenceSidebarCommands, type SequenceSidebarContext } from "../sequence-sidebar";
import { fragmentEditorCommands, type FragmentEditorContext } from "../fragment-editor";
import { fragmentImportCommands, type FragmentImportContext } from "../fragment-import";
import { fragmentListCommands, type FragmentListContext } from "../fragment-list";
import { fragmentSplitCommands, type FragmentSplitContext } from "../fragment-split";
import { projectConfigCommands, type ProjectConfigContext } from "../project-config";
import { projectManagementCommands, type ProjectManagementContext } from "../project-management";
import { projectShellCommands, type ProjectShellContext } from "../project-shell";

const find = <T extends { id: string }, Id extends T["id"]>(
  list: readonly T[],
  id: Id,
): Extract<T, { id: Id }> => list.find((c) => c.id === id) as Extract<T, { id: Id }>;

describe("scopes/overview", () => {
  const ctx: OverviewContext = {
    canDesignateMain: true,
    designateMain: vi.fn(),
    createSectionPending: false,
    createSection: vi.fn(),
    confirmingDeleteSectionId: null,
    deleteSection: vi.fn(),
    detailLevel: "prose",
    setDetailLevel: vi.fn(),
    arcOverlayOpen: false,
    toggleArcOverlay: vi.fn(),
    toggleArcExpanded: vi.fn(),
    toggleVerticalArcStrip: vi.fn(),
    placedSelectionCount: 0,
    groupSelection: vi.fn(),
    canSplitBefore: false,
    splitBefore: vi.fn(),
    canSplitAfter: false,
    splitAfter: vi.fn(),
    sectionsForMove: [],
    moveSelectionToSection: vi.fn(),
    mergeableUpSections: [],
    mergeableDownSections: [],
    mergeSectionUp: vi.fn(),
    mergeSectionDown: vi.fn(),
    placedFragmentsForUnplace: [],
    unplaceFragment: vi.fn(),
    splittableFragments: [],
    openSplit: vi.fn(),
  };

  it("designate-main runs and disables when sequence is already main", () => {
    const cmd = find(overviewCommands, "overview:designate-main");
    cmd.run(ctx);
    expect(ctx.designateMain).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, canDesignateMain: false })).toMatch(/already the main/);
  });

  it("add-section disables while pending", () => {
    expect(
      find(overviewCommands, "overview:add-section").disabled?.({
        ...ctx,
        createSectionPending: true,
      }),
    ).toBe("Adding section…");
  });

  it("delete-section disables when nothing is confirmed", () => {
    expect(
      find(overviewCommands, "overview:delete-section").disabled?.({
        ...ctx,
        confirmingDeleteSectionId: null,
      }),
    ).toMatch(/No section selected/);
  });

  it("set-detail-level runs with the chosen level", () => {
    const cmd = find(overviewCommands, "overview:set-detail-level");
    cmd.run(ctx, { level: "title", label: "Title only" });
    expect(ctx.setDetailLevel).toHaveBeenCalledWith("title");
  });

  it("toggle-arc-overlay runs", () => {
    find(overviewCommands, "overview:toggle-arc-overlay").run(ctx);
    expect(ctx.toggleArcOverlay).toHaveBeenCalled();
  });

  it("toggle-arc-expanded is gated on the overlay being open", () => {
    const cmd = find(overviewCommands, "overview:toggle-arc-expanded");
    expect(cmd.disabled?.({ ...ctx, arcOverlayOpen: false })).toMatch(/Open the arc overlay/);
    expect(cmd.disabled?.({ ...ctx, arcOverlayOpen: true })).toBeUndefined();
    cmd.run({ ...ctx, arcOverlayOpen: true });
    expect(ctx.toggleArcExpanded).toHaveBeenCalled();
  });

  it("toggle-vertical-arc-strip runs", () => {
    find(overviewCommands, "overview:toggle-vertical-arc-strip").run(ctx);
    expect(ctx.toggleVerticalArcStrip).toHaveBeenCalled();
  });

  it("group-selection runs and is gated on having a placed selection", () => {
    const cmd = find(overviewCommands, "overview:group-selection");
    expect(cmd.disabled?.({ ...ctx, placedSelectionCount: 0 })).toMatch(/Select placed fragments/);
    cmd.run({ ...ctx, placedSelectionCount: 2 });
    expect(ctx.groupSelection).toHaveBeenCalled();
  });

  it("split-before-selection is gated on canSplitBefore", () => {
    const cmd = find(overviewCommands, "overview:split-before-selection");
    expect(cmd.disabled?.({ ...ctx, canSplitBefore: false })).toMatch(/not the first/);
    expect(cmd.disabled?.({ ...ctx, canSplitBefore: true })).toBeUndefined();
    cmd.run({ ...ctx, canSplitBefore: true });
    expect(ctx.splitBefore).toHaveBeenCalled();
  });

  it("split-after-selection is gated on canSplitAfter", () => {
    const cmd = find(overviewCommands, "overview:split-after-selection");
    expect(cmd.disabled?.({ ...ctx, canSplitAfter: false })).toMatch(/not the last/);
    expect(cmd.disabled?.({ ...ctx, canSplitAfter: true })).toBeUndefined();
    cmd.run({ ...ctx, canSplitAfter: true });
    expect(ctx.splitAfter).toHaveBeenCalled();
  });

  it("move-selection-to-section runs with the chosen section", () => {
    const cmd = find(overviewCommands, "overview:move-selection-to-section");
    expect(cmd.disabled?.({ ...ctx, placedSelectionCount: 0 })).toMatch(/Select placed fragments/);
    cmd.run({ ...ctx, placedSelectionCount: 1 }, { uuid: "sec-1", name: "One" });
    expect(ctx.moveSelectionToSection).toHaveBeenCalledWith("sec-1");
  });

  it("merge-section-up runs with the chosen section and is gated on eligibility", () => {
    const cmd = find(overviewCommands, "overview:merge-section-up");
    expect(cmd.disabled?.({ ...ctx, mergeableUpSections: [] })).toMatch(/No section to merge up/);
    const eligible = { ...ctx, mergeableUpSections: [{ uuid: "sec-2", name: "Two" }] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, { uuid: "sec-2", name: "Two" });
    expect(ctx.mergeSectionUp).toHaveBeenCalledWith("sec-2");
  });

  it("merge-section-down runs with the chosen section and is gated on eligibility", () => {
    const cmd = find(overviewCommands, "overview:merge-section-down");
    expect(cmd.disabled?.({ ...ctx, mergeableDownSections: [] })).toMatch(
      /No section to merge down/,
    );
    const eligible = { ...ctx, mergeableDownSections: [{ uuid: "sec-1", name: "One" }] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, { uuid: "sec-1", name: "One" });
    expect(ctx.mergeSectionDown).toHaveBeenCalledWith("sec-1");
  });

  it("unplace-fragment runs with the chosen fragment and is gated on placement", () => {
    const cmd = find(overviewCommands, "overview:unplace-fragment");
    expect(cmd.disabled?.({ ...ctx, placedFragmentsForUnplace: [] })).toMatch(
      /No placed fragments/,
    );
    const eligible = { ...ctx, placedFragmentsForUnplace: [{ uuid: "frag-1", key: "frag-one" }] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, { uuid: "frag-1", key: "frag-one" });
    expect(ctx.unplaceFragment).toHaveBeenCalledWith("frag-1");
  });

  it("split-fragment opens the dialog for the chosen fragment and is gated on availability", () => {
    const cmd = find(overviewCommands, "overview:split-fragment");
    expect(cmd.disabled?.({ ...ctx, splittableFragments: [] })).toMatch(/No fragments to split/);
    const eligible = { ...ctx, splittableFragments: [{ uuid: "frag-1", key: "frag-one" }] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, { uuid: "frag-1", key: "frag-one" });
    expect(ctx.openSplit).toHaveBeenCalledWith("frag-1");
  });
});

describe("scopes/sequence-sidebar", () => {
  const sequence = (uuid: string, name: string) =>
    ({ uuid, name }) as SequenceSidebarContext["cloneableSequences"][number];

  const ctx: SequenceSidebarContext = {
    createSequencePending: false,
    createSequence: vi.fn(),
    confirmingDeleteSequenceId: null,
    deleteSequence: vi.fn(),
    toggleableSequences: [],
    setSequenceActive: vi.fn(),
    cloneableSequences: [],
    cloneSequence: vi.fn(),
    insertSourceSequences: [],
    insertTargetName: undefined,
    insertSequence: vi.fn(),
    renameableSequences: [],
    beginRenameSequence: vi.fn(),
  };

  it("create-sequence runs and reports Creating… while pending", () => {
    const cmd = find(sequenceSidebarCommands, "overview:create-sequence");
    cmd.run(ctx);
    expect(ctx.createSequence).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, createSequencePending: true })).toBe("Creating…");
  });

  it("delete-sequence disables without a confirmed id", () => {
    expect(find(sequenceSidebarCommands, "overview:delete-sequence").disabled?.(ctx)).toMatch(
      /No sequence selected/,
    );
  });

  it("clone-sequence clones the chosen sequence", () => {
    const cmd = find(sequenceSidebarCommands, "overview:clone-sequence");
    const target = sequence("seq-1", "Main");
    cmd.run({ ...ctx, cloneableSequences: [target] }, target);
    expect(ctx.cloneSequence).toHaveBeenCalledWith("seq-1");
  });

  it("rename-sequence opens the inline editor for the chosen sequence", () => {
    const cmd = find(sequenceSidebarCommands, "overview:rename-sequence");
    const target = sequence("seq-1", "Main");
    cmd.run({ ...ctx, renameableSequences: [target] }, target);
    expect(ctx.beginRenameSequence).toHaveBeenCalledWith("seq-1");
  });

  it("insert-sequence disables without an open target or source, runs otherwise", () => {
    const cmd = find(sequenceSidebarCommands, "overview:insert-sequence");
    const source = sequence("seq-2", "Other");
    expect(cmd.disabled?.(ctx)).toMatch(/No open sequence/);
    expect(cmd.disabled?.({ ...ctx, insertTargetName: "Main" })).toMatch(/No other sequence/);
    const eligible = { ...ctx, insertTargetName: "Main", insertSourceSequences: [source] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, source);
    expect(ctx.insertSequence).toHaveBeenCalledWith("seq-2");
  });
});

describe("scopes/fragment-editor", () => {
  const baseCtx: FragmentEditorContext = {
    hasFragment: true,
    isDiscarded: false,
    discard: vi.fn(),
    restore: vi.fn(),
    sequences: [],
    openPlaceInSequence: vi.fn(),
    openSplit: vi.fn(),
  };

  it("discard runs and is disabled in obvious bad states", () => {
    const cmd = find(fragmentEditorCommands, "fragment:discard");
    cmd.run(baseCtx);
    expect(baseCtx.discard).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...baseCtx, hasFragment: false })).toBe("No fragment to discard");
    expect(cmd.disabled?.({ ...baseCtx, isDiscarded: true })).toBe("Fragment is already discarded");
  });

  it("restore is disabled when nothing to restore", () => {
    const cmd = find(fragmentEditorCommands, "fragment:restore");
    expect(cmd.disabled?.({ ...baseCtx, isDiscarded: false })).toBe("Fragment is not discarded");
    expect(cmd.disabled?.({ ...baseCtx, isDiscarded: true })).toBeUndefined();
  });

  it("place-in-sequence opens the chosen sequence and disables in bad states", () => {
    const cmd = find(fragmentEditorCommands, "fragment:place-in-sequence");
    const sequence = { uuid: "seq-1", name: "Main" } as FragmentEditorContext["sequences"][number];
    const ctx = { ...baseCtx, sequences: [sequence] };

    cmd.run(ctx, sequence);
    expect(ctx.openPlaceInSequence).toHaveBeenCalledWith("seq-1");

    expect(cmd.disabled?.({ ...ctx, hasFragment: false })).toBe("No fragment to place");
    expect(cmd.disabled?.({ ...ctx, isDiscarded: true })).toBe("Fragment is discarded");
    expect(cmd.disabled?.({ ...ctx, sequences: [] })).toBe("No sequences");
    expect(cmd.disabled?.(ctx)).toBeUndefined();
  });

  it("split opens the dialog and disables when discarded or absent", () => {
    const cmd = find(fragmentEditorCommands, "fragment-editor:split");
    cmd.run(baseCtx);
    expect(baseCtx.openSplit).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...baseCtx, hasFragment: false })).toBe("No fragment to split");
    expect(cmd.disabled?.({ ...baseCtx, isDiscarded: true })).toBe("Fragment is discarded");
    expect(cmd.disabled?.(baseCtx)).toBeUndefined();
  });
});

describe("scopes/fragment-list", () => {
  const ctx: FragmentListContext = {
    splittableFragments: [],
    openSplit: vi.fn(),
  };

  it("split-fragment opens the dialog for the chosen fragment and is gated on availability", () => {
    const cmd = find(fragmentListCommands, "fragment-list:split-fragment");
    expect(cmd.disabled?.({ ...ctx, splittableFragments: [] })).toMatch(/No fragments to split/);
    const eligible = { ...ctx, splittableFragments: [{ uuid: "frag-1", key: "frag-one" }] };
    expect(cmd.disabled?.(eligible)).toBeUndefined();
    cmd.run(eligible, { uuid: "frag-1", key: "frag-one" });
    expect(ctx.openSplit).toHaveBeenCalledWith("frag-1");
  });
});

describe("scopes/fragment-split", () => {
  const ctx: FragmentSplitContext = {
    pieceCount: 3,
    isPending: false,
    confirm: vi.fn(),
  };

  it("confirm runs and is gated on piece count + pending state", () => {
    const cmd = find(fragmentSplitCommands, "fragment-split:confirm");
    cmd.run(ctx);
    expect(ctx.confirm).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, pieceCount: 1 })).toMatch(/nothing to split/);
    expect(cmd.disabled?.({ ...ctx, isPending: true })).toBe("Splitting…");
    expect(cmd.disabled?.(ctx)).toBeUndefined();
  });
});

describe("scopes/fragment-import", () => {
  it("import runs and disables when canImport=false", () => {
    const ctx: FragmentImportContext = { canImport: true, import: vi.fn() };
    const cmd = find(fragmentImportCommands, "fragment-import:import");
    cmd.run(ctx);
    expect(ctx.import).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, canImport: false })).toBe("No fragments to import");
  });
});

describe("scopes/project-config", () => {
  const makeContext = (): ProjectConfigContext => ({
    rebuildIndexPending: false,
    rebuildIndex: vi.fn(),
    resetDatabasePending: false,
    resetDatabase: vi.fn(),
  });

  it("rebuild-index runs and reports Rebuilding… while pending", () => {
    const ctx = makeContext();
    const cmd = find(projectConfigCommands, "config:rebuild-index");
    cmd.run(ctx);
    expect(ctx.rebuildIndex).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, rebuildIndexPending: true })).toBe("Rebuilding…");
  });

  it("reset-database runs and reports Resetting… while pending", () => {
    const ctx = makeContext();
    const cmd = find(projectConfigCommands, "config:reset-database");
    cmd.run(ctx);
    expect(ctx.resetDatabase).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, resetDatabasePending: true })).toBe("Resetting…");
  });
});

describe("scopes/project-management", () => {
  it("save-settings runs and disables when canSaveSettings=false", () => {
    const ctx: ProjectManagementContext = { canSaveSettings: true, saveSettings: vi.fn() };
    const cmd = find(projectManagementCommands, "project-management:save-settings");
    cmd.run(ctx);
    expect(ctx.saveSettings).toHaveBeenCalled();
    expect(cmd.disabled?.({ ...ctx, canSaveSettings: false })).toBe("No changes to save");
  });
});

describe("scopes/project-shell", () => {
  it("each create:* command calls openCreate with the matching kind", () => {
    const openCreate = vi.fn();
    const openExport = vi.fn();
    const ctx: ProjectShellContext = { projectId: "test-project", openCreate, openExport };

    find(projectShellCommands, "create:fragment").run(ctx);
    expect(openCreate).toHaveBeenLastCalledWith("fragment");

    find(projectShellCommands, "create:note").run(ctx);
    expect(openCreate).toHaveBeenLastCalledWith("note");

    find(projectShellCommands, "create:reference").run(ctx);
    expect(openCreate).toHaveBeenLastCalledWith("reference");

    find(projectShellCommands, "create:aspect").run(ctx);
    expect(openCreate).toHaveBeenLastCalledWith("aspect");
  });
});
