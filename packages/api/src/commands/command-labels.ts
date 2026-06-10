// Canonical backend domain labels for commands run via `executeCommand`. These
// are recorded as the `commandId` on a `command:error` action-log entry when a
// command throws. Single source of truth — `executeCommand` only accepts a
// `CommandLabel`, so a typo or drift at a call site is a compile error.
//
// Backend labels, not frontend command ids: correlation across the two is by
// `correlationId`, not by label equality (see ADR 0012).
export const COMMAND_LABELS = [
  // fragments
  "fragment:create",
  "fragment:extract",
  "fragment:insert",
  "fragment:update",
  "fragment:discard",
  "fragment:delete",
  "fragment:restore",
  "fragment:import",
  // shared extract/insert helper
  "source:cut-body",
  // aspects
  "aspect:create",
  "aspect:extract",
  "aspect:insert",
  "aspect:update",
  "aspect:delete",
  // notes
  "note:create",
  "note:extract",
  "note:insert",
  "note:update",
  "note:delete",
  // references
  "reference:create",
  "reference:extract",
  "reference:insert",
  "reference:update",
  "reference:delete",
  // sequences
  "sequence:ensure-main",
  "sequence:create",
  "sequence:update",
  "sequence:delete",
  "sequence:designate-main",
  "sequence:clone",
  "sequence:insert",
  "sequence:place-fragment",
  "sequence:move-fragment",
  "sequence:unplace-fragment",
  "sequence:group-fragments",
  "sequence:move-fragments",
  "sequence:create-section",
  "sequence:rename-section",
  "sequence:move-section",
  "sequence:delete-section",
  "sequence:split-section",
  "sequence:merge-section",
  "sequence:export",
  // margins
  "margin:write",
  // drafts
  "draft:create",
  "draft:delete",
  "draft:restore",
  // misc
  "index:rebuild",
  "database:reset",
  "warning:dismiss",
  "import:preview",
] as const;

export type CommandLabel = (typeof COMMAND_LABELS)[number];
