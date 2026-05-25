import { defineScope, defineScopeCommand } from "../define";

export interface ProjectConfigContext {
  rebuildIndexPending: boolean;
  rebuildIndex: () => void;
}

export const projectConfigScope = defineScope<ProjectConfigContext>("project-config", {
  label: "Project config",
});

const rebuildIndex = defineScopeCommand(projectConfigScope, {
  id: "config:rebuild-index",
  label: "Rebuild index",
  category: "project",
  disabled: (ctx) => (ctx.rebuildIndexPending ? "Rebuilding…" : undefined),
  run: (ctx) => ctx.rebuildIndex(),
});

export const projectConfigCommands = [rebuildIndex] as const;
