import { describe, it, expect, vi } from "vitest";
import { overviewCommands, type OverviewContext } from "../overview";
import { sequenceSidebarCommands, type SequenceSidebarContext } from "../sequence-sidebar";
import { fragmentEditorCommands, type FragmentEditorContext } from "../fragment-editor";
import { fragmentImportCommands, type FragmentImportContext } from "../fragment-import";
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
    canSplitSelection: false,
    splitSelection: vi.fn(),
    sectionsForMove: [],
    moveSelectionToSection: vi.fn(),
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

  it("split-at-selection is gated on canSplitSelection", () => {
    const cmd = find(overviewCommands, "overview:split-at-selection");
    expect(cmd.disabled?.({ ...ctx, canSplitSelection: false })).toMatch(/not the first/);
    expect(cmd.disabled?.({ ...ctx, canSplitSelection: true })).toBeUndefined();
    cmd.run({ ...ctx, canSplitSelection: true });
    expect(ctx.splitSelection).toHaveBeenCalled();
  });

  it("move-selection-to-section runs with the chosen section", () => {
    const cmd = find(overviewCommands, "overview:move-selection-to-section");
    expect(cmd.disabled?.({ ...ctx, placedSelectionCount: 0 })).toMatch(/Select placed fragments/);
    cmd.run({ ...ctx, placedSelectionCount: 1 }, { uuid: "sec-1", name: "One" });
    expect(ctx.moveSelectionToSection).toHaveBeenCalledWith("sec-1");
  });
});

describe("scopes/sequence-sidebar", () => {
  const ctx: SequenceSidebarContext = {
    createSequencePending: false,
    createSequence: vi.fn(),
    confirmingDeleteSequenceId: null,
    deleteSequence: vi.fn(),
    toggleableSequences: [],
    setSequenceActive: vi.fn(),
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
});

describe("scopes/fragment-editor", () => {
  const baseCtx: FragmentEditorContext = {
    hasFragment: true,
    isDiscarded: false,
    discard: vi.fn(),
    restore: vi.fn(),
    sequences: [],
    openPlaceInSequence: vi.fn(),
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
    const ctx: ProjectShellContext = { openCreate };

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
