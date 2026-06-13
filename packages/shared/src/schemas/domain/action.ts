import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "fragment:extracted",
  "note:extracted",
  "reference:extracted",
  "aspect:extracted",
  "fragment:appended",
  "note:appended",
  "reference:appended",
  "aspect:appended",
  "fragment:prepended",
  "note:prepended",
  "reference:prepended",
  "aspect:prepended",
  "fragment:created",
  "fragment:edited",
  "fragment:updated",
  "fragment:renamed",
  "fragment:discarded",
  "fragment:restored",
  "fragment:deleted",
  "fragment:readiness-changed",
  "fragment:note-attached",
  "fragment:note-detached",
  "fragment:reference-attached",
  "fragment:reference-detached",
  "fragment:aspect-attached",
  "fragment:aspect-detached",
  "fragment:aspect-weight-changed",
  "aspect:created",
  "aspect:description-edited",
  "aspect:updated",
  "aspect:renamed",
  "aspect:deleted",
  "aspect:category-changed",
  "aspect:note-attached",
  "aspect:note-detached",
  "note:created",
  "note:edited",
  "note:updated",
  "note:renamed",
  "note:deleted",
  "note:category-changed",
  "reference:created",
  "reference:edited",
  "reference:updated",
  "reference:renamed",
  "reference:deleted",
  "reference:category-changed",
  "sequence:fragment-placed",
  "sequence:fragment-moved",
  "sequence:fragment-unplaced",
  "sequence:created",
  "sequence:renamed",
  "sequence:deleted",
  "sequence:set-main",
  "sequence:activated",
  "sequence:deactivated",
  "sequence:section-reordered",
  "sequence:fragments-grouped",
  "sequence:fragments-moved",
  "sequence:section-split",
  "sequence:sections-merged",
  "sequence:cloned",
  "sequence:inserted",
  "draft:created",
  "draft:deleted",
  "draft:restored",
  "fragment:imported",
  "fragment:split",
  "margin:updated",
  "command:error",
  "sequence:exported",
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const LogEntryTargetSchema = z.object({
  type: z.enum(["fragment", "aspect", "note", "reference", "sequence", "draft", "margin"]),
  uuid: z.string(),
  key: z.string().optional(),
  title: z.string().optional(),
});

export type LogEntryTarget = z.infer<typeof LogEntryTargetSchema>;

const base = z.object({
  id: z.string(),
  timestamp: z.string(),
  // Required on every entry — ties the action back to the originating request
  // (echoed via the X-Correlation-Id response header) and the backend logs.
  correlationId: z.string(),
  actor: z.enum(["user", "system"]),
  target: LogEntryTargetSchema,
  undoable: z.boolean(),
});

const entry = <T extends ActionType, P extends z.ZodTypeAny>(type: T, payload: P) =>
  base.extend({ type: z.literal(type), payload });

const empty = z.object({});
const renamed = z.object({ oldKey: z.string(), newKey: z.string() });

const extractionPayload = z.object({
  sourceType: z.enum(["fragment", "note", "reference", "aspect"]),
  sourceKey: z.string(),
  sourceUuid: z.string(),
  sourceMode: z.enum(["keep", "cut", "link"]),
  navigated: z.boolean(),
});

export const LogEntrySchema = z.discriminatedUnion("type", [
  entry("fragment:extracted", extractionPayload),
  entry("note:extracted", extractionPayload),
  entry("reference:extracted", extractionPayload),
  entry("aspect:extracted", extractionPayload),
  entry("fragment:appended", extractionPayload),
  entry("note:appended", extractionPayload),
  entry("reference:appended", extractionPayload),
  entry("aspect:appended", extractionPayload),
  entry("fragment:prepended", extractionPayload),
  entry("note:prepended", extractionPayload),
  entry("reference:prepended", extractionPayload),
  entry("aspect:prepended", extractionPayload),
  entry("fragment:created", empty),
  entry("fragment:edited", empty),
  entry(
    "fragment:updated",
    z.object({
      changedFields: z.array(z.enum(["content", "readiness", "aspects", "notes", "references"])),
    }),
  ),
  entry("fragment:renamed", renamed),
  entry("fragment:discarded", empty),
  entry("fragment:restored", empty),
  entry("fragment:deleted", empty),
  entry("fragment:readiness-changed", z.object({ from: z.number(), to: z.number() })),
  entry("fragment:note-attached", z.object({ noteKey: z.string() })),
  entry("fragment:note-detached", z.object({ noteKey: z.string() })),
  entry("fragment:reference-attached", z.object({ referenceKey: z.string() })),
  entry("fragment:reference-detached", z.object({ referenceKey: z.string() })),
  entry("fragment:aspect-attached", z.object({ aspectKey: z.string(), weight: z.number() })),
  entry("fragment:aspect-detached", z.object({ aspectKey: z.string() })),
  entry(
    "fragment:aspect-weight-changed",
    z.object({ aspectKey: z.string(), from: z.number(), to: z.number() }),
  ),
  entry("aspect:created", empty),
  entry("aspect:description-edited", empty),
  entry(
    "aspect:updated",
    z.object({ changedFields: z.array(z.enum(["description", "category", "color", "notes"])) }),
  ),
  entry("aspect:renamed", renamed),
  entry("aspect:deleted", z.object({ cascadeFragmentCount: z.number() })),
  entry(
    "aspect:category-changed",
    z.object({ from: z.string().optional(), to: z.string().optional() }),
  ),
  entry("aspect:note-attached", z.object({ noteKey: z.string() })),
  entry("aspect:note-detached", z.object({ noteKey: z.string() })),
  entry("note:created", empty),
  entry("note:edited", empty),
  entry("note:updated", z.object({ changedFields: z.array(z.enum(["content"])) })),
  entry("note:renamed", renamed),
  entry("note:deleted", empty),
  entry(
    "note:category-changed",
    z.object({ from: z.string().optional(), to: z.string().optional() }),
  ),
  entry("reference:created", empty),
  entry("reference:edited", empty),
  entry("reference:updated", z.object({ changedFields: z.array(z.enum(["content"])) })),
  entry("reference:renamed", renamed),
  entry("reference:deleted", empty),
  entry(
    "reference:category-changed",
    z.object({ from: z.string().optional(), to: z.string().optional() }),
  ),
  entry("sequence:fragment-placed", z.object({ fragmentKey: z.string() })),
  entry("sequence:fragment-moved", z.object({ fragmentKey: z.string() })),
  entry("sequence:fragment-unplaced", z.object({ fragmentKey: z.string() })),
  entry("sequence:created", empty),
  entry("sequence:renamed", renamed),
  entry("sequence:deleted", empty),
  entry("sequence:set-main", empty),
  entry("sequence:activated", empty),
  entry("sequence:deactivated", empty),
  entry("sequence:section-reordered", z.object({ sectionName: z.string() })),
  entry(
    "sequence:fragments-grouped",
    z.object({ sectionName: z.string(), fragmentCount: z.number() }),
  ),
  entry(
    "sequence:fragments-moved",
    z.object({ sectionName: z.string(), fragmentCount: z.number() }),
  ),
  entry("sequence:section-split", z.object({ sectionName: z.string() })),
  entry("sequence:sections-merged", z.object({ sectionName: z.string() })),
  entry("sequence:cloned", z.object({ sourceName: z.string() })),
  entry("sequence:inserted", z.object({ sourceName: z.string(), sectionCount: z.number() })),
  entry("draft:created", z.object({ name: z.string(), note: z.string().optional() })),
  entry("draft:deleted", z.object({ name: z.string() })),
  entry(
    "draft:restored",
    z.object({ name: z.string(), preRestoreDraftUuid: z.string().optional() }),
  ),
  entry(
    "fragment:imported",
    z.object({
      sourceFileName: z.string(),
      fragmentCount: z.number().int(),
      format: z.string(),
      delimiter: z.string().optional(),
      headingLevel: z.number().int().optional(),
      importSequenceUuid: z.string().optional(),
    }),
  ),
  // One entry per split, mirroring fragment:imported — the new pieces do NOT get
  // their own fragment:created entries. `delimiter` is a label string
  // ("heading:2", "thematic-break", "blank-line"). Non-undoable: content is fully
  // preserved across the resulting fragments, so there is no archive to restore.
  entry(
    "fragment:split",
    z.object({
      sourceFragmentUuid: z.string(),
      delimiter: z.string(),
      createdCount: z.number().int(),
      createdUuids: z.array(z.string()),
    }),
  ),
  entry("margin:updated", empty),
  // Command failure. Unlike every other entry, this records "what happened"
  // rather than "what the user did": actor is always the system, and target is
  // optional because a failed command may have no resolved target. Written by
  // `executeCommand` (backend-reached failures) or via the action-log errors
  // endpoint (frontend-only failures). `friendlyMessage` is optional — the
  // backend has no source for it, only the frontend sets it.
  base.extend({
    type: z.literal("command:error"),
    actor: z.literal("system"),
    target: LogEntryTargetSchema.optional(),
    undoable: z.literal(false),
    payload: z.object({
      commandId: z.string(),
      friendlyMessage: z.string().optional(),
      technicalMessage: z.string(),
    }),
  }),
  entry(
    "sequence:exported",
    z.object({
      sequenceName: z.string(),
      format: z.enum(["md", "txt", "docx"]),
      fileName: z.string(),
      archivePath: z.string(),
      fragmentCount: z.number().int(),
    }),
  ),
]);

export type LogEntry = z.infer<typeof LogEntrySchema>;
export type ActionPayload = LogEntry["payload"];
export const LogEntryListSchema = z.array(LogEntrySchema);

// A command failure entry — "what happened" rather than "what the user did".
export type CommandErrorEntry = Extract<LogEntry, { type: "command:error" }>;

// Every other entry — a user action with a resolved target. These always carry a
// required `target`; only `command:error` makes it optional. Renderers that assume
// a target should take this narrower type, not the full `LogEntry` union.
export type ActionLogEntry = Exclude<LogEntry, { type: "command:error" }>;
