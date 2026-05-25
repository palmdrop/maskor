import { navigationCommands } from "./navigation";
import { projectCommands } from "./project";

// Aggregates every `defineGlobalCommand` array exported from this directory.
// Each command file exports a `const ... = [...] as const` tuple, which is
// spread here so the resulting union preserves literal `id` types.

export const globalCommands = [...navigationCommands, ...projectCommands] as const;
