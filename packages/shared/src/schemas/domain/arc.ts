import { z } from "zod";

// A single control point on an arc curve. Both axes are normalized to [0, 1]:
// x = position in the sequence (0 = start, 1 = end), sequence-length-independent.
// y = target intensity at that position.
// The sequencer interpolates between adjacent points at query time.
export const ArcPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type ArcPoint = z.infer<typeof ArcPointSchema>;

export const ArcSchema = z.object({
  uuid: z.uuid(),
  aspectKey: z.string(),
  points: z.array(ArcPointSchema).min(2),
});

export type Arc = z.infer<typeof ArcSchema>;

export const ArcCreateSchema = z.object({
  aspectKey: z.string().min(1),
  points: z.array(ArcPointSchema).min(2),
});

export type ArcCreate = z.infer<typeof ArcCreateSchema>;

export const ArcUpdateSchema = z.object({
  points: z.array(ArcPointSchema).min(2).optional(),
});

export type ArcUpdate = z.infer<typeof ArcUpdateSchema>;
