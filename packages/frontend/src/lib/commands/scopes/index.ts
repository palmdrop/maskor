import { suggestionModeCommands } from "./suggestion-mode";

// Aggregates every `defineScopeCommand` array exported from this directory.
// Each scope file exports both its scope declaration (e.g. `suggestionModeScope`)
// and a `const ...Commands = [...] as const` tuple of its commands. The barrel
// spreads them here so the resulting union preserves literal `id` types.

export const scopeCommands = [...suggestionModeCommands] as const;
