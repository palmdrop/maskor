// Aggregates every `defineGlobalCommand` array exported from this directory.
// Each command file exports a `const ... = [...] as const` tuple, which is
// spread here so the resulting union preserves literal `id` types.
//
// To register a new global command, create a file in this directory and add
// it to this list.

export const globalCommands = [] as const;
