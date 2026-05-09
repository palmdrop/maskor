import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "fragment:created",
  "fragment:edited",
  "fragment:updated",
  "fragment:renamed",
  "fragment:discarded",
  "fragment:restored",
  "fragment:deleted",
  "fragment:ready-status-changed",
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
  "reference:created",
  "reference:edited",
  "reference:updated",
  "reference:renamed",
  "reference:deleted",
  "sequence:fragment-placed",
  "sequence:fragment-moved",
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const LogEntryTargetSchema = z.object({
  type: z.enum(["fragment", "aspect", "note", "reference", "sequence"]),
  uuid: z.string(),
  key: z.string().optional(),
  title: z.string().optional(),
});

export type LogEntryTarget = z.infer<typeof LogEntryTargetSchema>;

const base = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.enum(["user", "system"]),
  target: LogEntryTargetSchema,
  undoable: z.boolean(),
});

const entry = <T extends ActionType, P extends z.ZodTypeAny>(type: T, payload: P) =>
  base.extend({ type: z.literal(type), payload });

const empty = z.object({});
const renamed = z.object({ oldKey: z.string(), newKey: z.string() });

export const LogEntrySchema = z.discriminatedUnion("type", [
  entry("fragment:created", empty),
  entry("fragment:edited", empty),
  entry(
    "fragment:updated",
    z.object({
      changedFields: z.array(z.enum(["content", "readyStatus", "aspects", "notes", "references"])),
    }),
  ),
  entry("fragment:renamed", renamed),
  entry("fragment:discarded", empty),
  entry("fragment:restored", empty),
  entry("fragment:deleted", empty),
  entry("fragment:ready-status-changed", z.object({ from: z.number(), to: z.number() })),
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
    z.object({ changedFields: z.array(z.enum(["description", "category", "notes"])) }),
  ),
  entry("aspect:renamed", renamed),
  entry("aspect:deleted", empty),
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
  entry("reference:created", empty),
  entry("reference:edited", empty),
  entry("reference:updated", z.object({ changedFields: z.array(z.enum(["content"])) })),
  entry("reference:renamed", renamed),
  entry("reference:deleted", empty),
  entry("sequence:fragment-placed", empty),
  entry("sequence:fragment-moved", empty),
]);

export type LogEntry = z.infer<typeof LogEntrySchema>;
export type ActionPayload = LogEntry["payload"];
export const LogEntryListSchema = z.array(LogEntrySchema);
