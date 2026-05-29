import { z } from "@hono/zod-openapi";

// Fields shared by every warning. `createdAt` is serialized as an ISO-8601 string.
const warningBaseFields = {
  id: z.string(),
  category: z.enum(["state", "event"]),
  createdAt: z.string(),
};

const UnknownAspectKeyWarningSchema = z.object({
  ...warningBaseFields,
  kind: z.literal("UNKNOWN_ASPECT_KEY"),
  aspectKey: z.string(),
  fragmentUuids: z.array(z.string()),
});

const WrongFormatFileWarningSchema = z.object({
  ...warningBaseFields,
  kind: z.literal("WRONG_FORMAT_FILE"),
  filePath: z.string(),
});

const UuidCollisionWarningSchema = z.object({
  ...warningBaseFields,
  kind: z.literal("UUID_COLLISION"),
  filePath: z.string(),
  collidingPath: z.string(),
  newUuid: z.string(),
});

export const VaultWarningSchema = z
  .discriminatedUnion("kind", [
    UnknownAspectKeyWarningSchema,
    WrongFormatFileWarningSchema,
    UuidCollisionWarningSchema,
  ])
  .openapi("VaultWarning");

export const VaultWarningListSchema = z.array(VaultWarningSchema).openapi("VaultWarningList");

export const WarningIdParamSchema = z.object({
  projectId: z.uuid(),
  id: z.string(),
});
