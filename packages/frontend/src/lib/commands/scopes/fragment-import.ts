import { defineScope, defineScopeCommand } from "../define";

export interface FragmentImportContext {
  canImport: boolean;
  import: () => void;
}

export const fragmentImportScope = defineScope<FragmentImportContext>("fragment-import", {
  label: "Fragment import",
});

const importFragments = defineScopeCommand(fragmentImportScope, {
  id: "fragment-import:import",
  onFailure: "Import failed.",
  label: "Import fragments",
  category: "create",
  disabled: (ctx) => (ctx.canImport ? undefined : "No fragments to import"),
  run: (ctx) => ctx.import(),
});

export const fragmentImportCommands = [importFragments] as const;
