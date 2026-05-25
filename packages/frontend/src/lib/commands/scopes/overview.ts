import { defineScope, defineScopeCommand } from "../define";

export interface OverviewContext {
  canDesignateMain: boolean;
  designateMain: () => void;
  createSectionPending: boolean;
  createSection: () => void;
  confirmingDeleteSectionId: string | null;
  deleteSection: () => void;
}

export const overviewScope = defineScope<OverviewContext>("overview", {
  label: "Overview",
});

const designateMain = defineScopeCommand(overviewScope, {
  id: "overview:designate-main",
  label: "Make main",
  category: "project",
  disabled: (ctx) =>
    ctx.canDesignateMain ? undefined : "This sequence is already the main sequence",
  run: (ctx) => ctx.designateMain(),
});

const addSection = defineScopeCommand(overviewScope, {
  id: "overview:add-section",
  label: "Add section",
  category: "create",
  disabled: (ctx) => (ctx.createSectionPending ? "Adding section…" : undefined),
  run: (ctx) => ctx.createSection(),
});

const deleteSection = defineScopeCommand(overviewScope, {
  id: "overview:delete-section",
  label: "Delete section",
  category: "other",
  disabled: (ctx) =>
    ctx.confirmingDeleteSectionId === null ? "No section selected for deletion" : undefined,
  run: (ctx) => ctx.deleteSection(),
});

export const overviewCommands = [designateMain, addSection, deleteSection] as const;
