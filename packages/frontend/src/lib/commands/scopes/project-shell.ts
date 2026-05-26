import { defineScope, defineScopeCommand } from "../define";

export type CreateKind = "fragment" | "note" | "reference" | "aspect";

export interface ProjectShellContext {
  openCreate: (kind: CreateKind) => void;
  openQuickSwitcher: () => void;
}

// Active whenever a project is open (ProjectShellLayout is mounted). Hosts the
// four `create:*` commands; they live here rather than in commands/global/
// because their behavior depends on a publisher that owns the creation-dialog
// state.
export const projectShellScope = defineScope<ProjectShellContext>("project-shell", {
  label: "Project",
});

const createFragment = defineScopeCommand(projectShellScope, {
  id: "create:fragment",
  label: "Create fragment…",
  category: "create",
  run: (ctx) => ctx.openCreate("fragment"),
});

const createNote = defineScopeCommand(projectShellScope, {
  id: "create:note",
  label: "Create note…",
  category: "create",
  run: (ctx) => ctx.openCreate("note"),
});

const createReference = defineScopeCommand(projectShellScope, {
  id: "create:reference",
  label: "Create reference…",
  category: "create",
  run: (ctx) => ctx.openCreate("reference"),
});

const createAspect = defineScopeCommand(projectShellScope, {
  id: "create:aspect",
  label: "Create aspect…",
  category: "create",
  run: (ctx) => ctx.openCreate("aspect"),
});

const switchTo = defineScopeCommand(projectShellScope, {
  id: "project:switch-to",
  label: "Switch to…",
  category: "navigation",
  run: (ctx) => ctx.openQuickSwitcher(),
});

export const projectShellCommands = [
  createFragment,
  createNote,
  createReference,
  createAspect,
  switchTo,
] as const;
