import { z } from "@hono/zod-openapi";
import {
  ArcSchema as DomainArcSchema,
  ArcCreateSchema as DomainArcCreateSchema,
} from "@maskor/shared";

export const ArcPointSchema = z
  .object({
    x: z.number().min(0).max(1).openapi({ example: 0.5 }),
    y: z.number().min(0).max(1).openapi({ example: 0.5 }),
  })
  .openapi("ArcPoint");

export const ArcSchema = DomainArcSchema.extend({
  uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  aspectKey: z.string().openapi({ example: "tone" }),
  points: z.array(ArcPointSchema).min(2),
}).openapi("Arc");

export const ArcCreateSchema = DomainArcCreateSchema.extend({
  points: z.array(ArcPointSchema).min(2),
}).openapi("ArcCreate");

export const ArcAspectParamSchema = z.object({
  projectId: z.uuid(),
  aspectId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});
