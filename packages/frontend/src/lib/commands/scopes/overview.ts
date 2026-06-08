import type { OverviewDetailLevel } from "../../../router";
import { defineScope, defineScopeCommand } from "../define";

const DETAIL_LEVEL_OPTIONS: ReadonlyArray<{ level: OverviewDetailLevel; label: string }> = [
  { level: "prose", label: "Prose" },
  { level: "excerpt", label: "Title + excerpt" },
  { level: "title", label: "Title only" },
];

export interface OverviewContext {
  canDesignateMain: boolean;
  designateMain: () => void;
  createSectionPending: boolean;
  createSection: () => void;
  confirmingDeleteSectionId: string | null;
  deleteSection: () => void;
  detailLevel: OverviewDetailLevel;
  setDetailLevel: (detailLevel: OverviewDetailLevel) => void;
  arcOverlayOpen: boolean;
  toggleArcOverlay: () => void;
  toggleArcExpanded: () => void;
  toggleVerticalArcStrip: () => void;
  placedSelectionCount: number;
  groupSelection: () => void;
  canSplitBefore: boolean;
  splitBefore: () => void;
  canSplitAfter: boolean;
  splitAfter: () => void;
  sectionsForMove: ReadonlyArray<{ uuid: string; name: string }>;
  moveSelectionToSection: (sectionUuid: string) => void;
  mergeableUpSections: ReadonlyArray<{ uuid: string; name: string }>;
  mergeableDownSections: ReadonlyArray<{ uuid: string; name: string }>;
  mergeSectionUp: (sectionUuid: string) => void;
  mergeSectionDown: (sectionUuid: string) => void;
}

export const overviewScope = defineScope<OverviewContext>("overview", {
  label: "Overview",
});

const designateMain = defineScopeCommand(overviewScope, {
  id: "overview:designate-main",
  onFailure: "Failed to designate main sequence.",
  label: "Make main",
  category: "project",
  disabled: (ctx) =>
    ctx.canDesignateMain ? undefined : "This sequence is already the main sequence",
  run: (ctx) => ctx.designateMain(),
});

const addSection = defineScopeCommand(overviewScope, {
  id: "overview:add-section",
  onFailure: "Failed to add section.",
  label: "Add section",
  category: "create",
  disabled: (ctx) => (ctx.createSectionPending ? "Adding section…" : undefined),
  run: (ctx) => ctx.createSection(),
});

const deleteSection = defineScopeCommand(overviewScope, {
  id: "overview:delete-section",
  onFailure: "Failed to delete section.",
  label: "Delete section",
  category: "other",
  disabled: (ctx) =>
    ctx.confirmingDeleteSectionId === null ? "No section selected for deletion" : undefined,
  run: (ctx) => ctx.deleteSection(),
});

const setDetailLevel = defineScopeCommand(overviewScope, {
  id: "overview:set-detail-level",
  label: "Set spine detail level…",
  category: "other",
  arg: {
    items: () => DETAIL_LEVEL_OPTIONS,
    getKey: (item) => item.level,
    getLabel: (item) => item.label,
    placeholder: "Set spine detail level…",
  },
  run: (ctx, target) => ctx.setDetailLevel(target.level),
});

const toggleArcOverlay = defineScopeCommand(overviewScope, {
  id: "overview:toggle-arc-overlay",
  label: "Toggle aspect arc overlay",
  category: "other",
  run: (ctx) => ctx.toggleArcOverlay(),
});

const toggleArcExpanded = defineScopeCommand(overviewScope, {
  id: "overview:toggle-arc-expanded",
  label: "Toggle expanded arc view",
  category: "other",
  disabled: (ctx) => (ctx.arcOverlayOpen ? undefined : "Open the arc overlay first"),
  run: (ctx) => ctx.toggleArcExpanded(),
});

const toggleVerticalArcStrip = defineScopeCommand(overviewScope, {
  id: "overview:toggle-vertical-arc-strip",
  label: "Toggle vertical arc strip",
  category: "other",
  run: (ctx) => ctx.toggleVerticalArcStrip(),
});

const groupSelection = defineScopeCommand(overviewScope, {
  id: "overview:group-selection",
  onFailure: "Failed to group fragments.",
  label: "Group selected fragments into a new section",
  category: "create",
  disabled: (ctx) =>
    ctx.placedSelectionCount < 1 ? "Select placed fragments to group" : undefined,
  run: (ctx) => ctx.groupSelection(),
});

const splitBefore = defineScopeCommand(overviewScope, {
  id: "overview:split-before-selection",
  onFailure: "Failed to split section.",
  label: "Split section before selected fragment",
  category: "other",
  disabled: (ctx) =>
    ctx.canSplitBefore
      ? undefined
      : "Select one placed fragment that is not the first in its section",
  run: (ctx) => ctx.splitBefore(),
});

const splitAfter = defineScopeCommand(overviewScope, {
  id: "overview:split-after-selection",
  onFailure: "Failed to split section.",
  label: "Split section after selected fragment",
  category: "other",
  disabled: (ctx) =>
    ctx.canSplitAfter
      ? undefined
      : "Select one placed fragment that is not the last in its section",
  run: (ctx) => ctx.splitAfter(),
});

const moveSelectionToSection = defineScopeCommand(overviewScope, {
  id: "overview:move-selection-to-section",
  onFailure: "Failed to move fragments.",
  label: "Move selected fragments to section…",
  category: "other",
  disabled: (ctx) => (ctx.placedSelectionCount < 1 ? "Select placed fragments to move" : undefined),
  arg: {
    items: (ctx) => ctx.sectionsForMove,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.name || "Untitled section",
    placeholder: "Move selection to section…",
  },
  run: (ctx, target) => ctx.moveSelectionToSection(target.uuid),
});

const mergeSectionUp = defineScopeCommand(overviewScope, {
  id: "overview:merge-section-up",
  onFailure: "Failed to merge sections.",
  label: "Merge section into previous…",
  category: "other",
  disabled: (ctx) => (ctx.mergeableUpSections.length > 0 ? undefined : "No section to merge up"),
  arg: {
    items: (ctx) => ctx.mergeableUpSections,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.name || "Untitled section",
    placeholder: "Merge section into previous…",
  },
  run: (ctx, target) => ctx.mergeSectionUp(target.uuid),
});

const mergeSectionDown = defineScopeCommand(overviewScope, {
  id: "overview:merge-section-down",
  onFailure: "Failed to merge sections.",
  label: "Merge section into next…",
  category: "other",
  disabled: (ctx) =>
    ctx.mergeableDownSections.length > 0 ? undefined : "No section to merge down",
  arg: {
    items: (ctx) => ctx.mergeableDownSections,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.name || "Untitled section",
    placeholder: "Merge section into next…",
  },
  run: (ctx, target) => ctx.mergeSectionDown(target.uuid),
});

export const overviewCommands = [
  designateMain,
  addSection,
  deleteSection,
  setDetailLevel,
  toggleArcOverlay,
  toggleArcExpanded,
  toggleVerticalArcStrip,
  groupSelection,
  splitBefore,
  splitAfter,
  moveSelectionToSection,
  mergeSectionUp,
  mergeSectionDown,
] as const;
