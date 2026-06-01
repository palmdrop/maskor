import { z } from "@hono/zod-openapi";
import { CommentSchema as DomainCommentSchema } from "@maskor/shared";

export const CommentSchema = DomainCommentSchema.extend({
  markerId: z.string().openapi({ example: "a1b2c3d4" }),
  excerpt: z.string().openapi({ example: "The bridge groans under the weight." }),
  body: z.string().openapi({ example: "Too literal — rework." }),
}).openapi("Comment");

// createdAt/updatedAt are re-typed as ISO strings (JSON serialization of the Date fields).
export const MarginSchema = z
  .object({
    fragmentUuid: z.uuid().openapi({ example: "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b" }),
    fragmentKey: z.string().openapi({ example: "the-bridge" }),
    notes: z.string().openapi({ example: "Thoughts on structure." }),
    comments: z.array(CommentSchema),
    createdAt: z.string().openapi({ example: "2026-06-01T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-06-01T00:00:00.000Z" }),
  })
  .openapi("Margin");

// An orphaned comment carries its owning fragment so the panel can group it.
export const OrphanedCommentSchema = CommentSchema.extend({
  fragmentUuid: z.uuid().openapi({ example: "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b" }),
}).openapi("OrphanedComment");

export const MarginParamSchema = z.object({
  projectId: z.uuid(),
  fragmentId: z.uuid().openapi({ example: "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b" }),
});

export const CommentParamSchema = MarginParamSchema.extend({
  markerId: z.string().openapi({ example: "a1b2c3d4" }),
});

export const MarginWriteSchema = z
  .object({
    notes: z.string().openapi({ example: "Thoughts on structure." }),
    comments: z.array(CommentSchema),
  })
  .openapi("MarginWrite");

export const CommentCreateSchema = CommentSchema.openapi("CommentCreate");

export const CommentUpdateSchema = z
  .object({
    excerpt: z.string().optional().openapi({ example: "The bridge groans." }),
    body: z.string().optional().openapi({ example: "Reworked thought." }),
  })
  .openapi("CommentUpdate");
