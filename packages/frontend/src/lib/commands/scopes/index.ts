import { suggestionModeCommands } from "./suggestion-mode";
import { overviewCommands } from "./overview";
import { sequenceSidebarCommands } from "./sequence-sidebar";
import { fragmentEditorCommands } from "./fragment-editor";
import { fragmentNavCommands } from "./fragment-nav";
import { marginCommands } from "./margin";
import { fragmentImportCommands } from "./fragment-import";
import { fragmentListCommands } from "./fragment-list";
import { fragmentMetadataCommands } from "./fragment-metadata";
import { aspectReaderCommands } from "./aspect-reader";
import { configEntitiesCommands } from "./config-entities";
import { projectConfigCommands } from "./project-config";
import { projectManagementCommands } from "./project-management";
import { projectShellCommands } from "./project-shell";
import { editorCommands } from "./editor";
import { commandPaletteCommands } from "./command-palette";
import { quickSwitcherCommands } from "./quick-switcher";

// Aggregates every `defineScopeCommand` array exported from this directory.
// Each scope file exports both its scope declaration (e.g. `suggestionModeScope`)
// and a `const ...Commands = [...] as const` tuple of its commands. The barrel
// spreads them here so the resulting union preserves literal `id` types.

export const scopeCommands = [
  ...suggestionModeCommands,
  ...overviewCommands,
  ...sequenceSidebarCommands,
  ...fragmentEditorCommands,
  ...fragmentNavCommands,
  ...marginCommands,
  ...fragmentImportCommands,
  ...fragmentListCommands,
  ...fragmentMetadataCommands,
  ...aspectReaderCommands,
  ...configEntitiesCommands,
  ...projectConfigCommands,
  ...projectManagementCommands,
  ...projectShellCommands,
  ...editorCommands,
  ...commandPaletteCommands,
  ...quickSwitcherCommands,
] as const;
