import { z } from "zod";

export const ActionTypeSchema = z.enum([
  "fragment:created",
  "fragment:updated",
  "fragment:renamed",
  "fragment:discarded",
  "fragment:restored",
  "aspect:created",
  "aspect:updated",
  "aspect:renamed",
  "aspect:deleted",
  "note:created",
  "note:updated",
  "note:renamed",
  "note:deleted",
  "reference:created",
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

const entry = <T extends ActionType>(type: T, payload: z.ZodTypeAny) =>
  base.extend({ type: z.literal(type), payload });

const empty = z.object({});
const renamed = z.object({ oldKey: z.string(), newKey: z.string() });

export const LogEntrySchema = z.discriminatedUnion("type", [
  entry("fragment:created", empty),
  entry(
    "fragment:updated",
    z.object({
      changedFields: z.array(z.enum(["content", "readyStatus", "aspects", "notes", "references"])),
    }),
  ),
  entry("fragment:renamed", renamed),
  entry("fragment:discarded", empty),
  entry("fragment:restored", empty),
  entry("aspect:created", empty),
  entry(
    "aspect:updated",
    z.object({ changedFields: z.array(z.enum(["description", "category", "notes"])) }),
  ),
  entry("aspect:renamed", renamed),
  entry("aspect:deleted", empty),
  entry("note:created", empty),
  entry("note:updated", z.object({ changedFields: z.array(z.enum(["content"])) })),
  entry("note:renamed", renamed),
  entry("note:deleted", empty),
  entry("reference:created", empty),
  entry("reference:updated", z.object({ changedFields: z.array(z.enum(["content"])) })),
  entry("reference:renamed", renamed),
  entry("reference:deleted", empty),
  entry("sequence:fragment-placed", empty),
  entry("sequence:fragment-moved", empty),
]);

export type LogEntry = z.infer<typeof LogEntrySchema>;
export type ActionPayload = LogEntry["payload"];
export const LogEntryListSchema = z.array(LogEntrySchema);
