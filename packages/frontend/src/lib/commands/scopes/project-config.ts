import { defineScope, defineScopeCommand } from "../define";

export interface ProjectConfigContext {
  rebuildIndexPending: boolean;
  rebuildIndex: () => void;
  resetDatabasePending: boolean;
  resetDatabase: () => void;
}

export const projectConfigScope = defineScope<ProjectConfigContext>("project-config", {
  label: "Project config",
});

const rebuildIndex = defineScopeCommand(projectConfigScope, {
  id: "config:rebuild-index",
  onFailure: "Index rebuild failed.",
  label: "Rebuild index",
  category: "project",
  disabled: (ctx) => (ctx.rebuildIndexPending ? "Rebuilding…" : undefined),
  run: (ctx) => ctx.rebuildIndex(),
});

const resetDatabase = defineScopeCommand(projectConfigScope, {
  id: "config:reset-database",
  onFailure: "Database reset failed.",
  label: "Reset database",
  category: "project",
  disabled: (ctx) => (ctx.resetDatabasePending ? "Resetting…" : undefined),
  run: (ctx) => ctx.resetDatabase(),
});

export const projectConfigCommands = [rebuildIndex, resetDatabase] as const;
