import { z } from "zod";

// A Comment is an anchored annotation block inside a fragment's Margin. It is bound to a single
// fragment block by `markerId` — the id carried by the trailing `<!--c:markerId-->` marker on that
// block. `excerpt` is a stored snapshot of the block for side-by-side display and orphan context;
// it is not the authoritative anchor (the marker is). `body` is the free-prose comment text.
export const CommentSchema = z.object({
  markerId: z.string(),
  excerpt: z.string(),
  body: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;

// A Margin is the companion annotation document for a fragment: one file at
// `margins/<fragment-key>.md`. `fragmentUuid` is the stable join to its fragment; `fragmentKey`
// mirrors the filename stem (the fragment's key). `notes` is the free-prose whole-fragment notes
// section; `comments` is the anchored comments section, in authoring order.
export const MarginSchema = z.object({
  fragmentUuid: z.uuid(),
  fragmentKey: z.string(),
  notes: z.string(),
  comments: z.array(CommentSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Margin = z.infer<typeof MarginSchema>;
