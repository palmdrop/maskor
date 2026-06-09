import { ListSequences } from "@api/generated/sequences/sequences";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { defineScope, defineScopeCommand } from "../define";

export type CreateKind = "fragment" | "note" | "reference" | "aspect";

export interface ProjectShellContext {
  projectId: string;
  openCreate: (kind: CreateKind) => void;
  openExport: (sequenceId?: string | null) => void;
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

// Parameterized: the palette shows a sequence picker; calling
// `commands.run("project:export", sequenceId)` bypasses the picker and
// opens the dialog with the given sequence pre-selected.
const exportSequence = defineScopeCommand(projectShellScope, {
  id: "project:export",
  label: "Export…",
  category: "project",
  arg: {
    items: async (ctx): Promise<readonly Sequence[]> => {
      const response = await ListSequences(ctx.projectId);
      return response.status === 200 ? response.data.sequences : [];
    },
    getKey: (sequence) => sequence.uuid,
    getLabel: (sequence) => sequence.name,
    placeholder: "Select sequence to export…",
  },
  run: (ctx, sequence) => ctx.openExport(sequence.uuid),
});

export const projectShellCommands = [
  createFragment,
  createNote,
  createReference,
  createAspect,
  exportSequence,
] as const;
