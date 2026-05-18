import { z } from "zod";

export const DraftEntityCountsSchema = z.object({
  fragments: z.number().int().min(0),
  aspects: z.number().int().min(0),
  notes: z.number().int().min(0),
  references: z.number().int().min(0),
  sequences: z.number().int().min(0),
});

export type DraftEntityCounts = z.infer<typeof DraftEntityCountsSchema>;

export const DraftManifestSchema = z.object({
  uuid: z.string(),
  name: z.string().min(1),
  note: z.string().optional(),
  createdAt: z.string(),
  entityCounts: DraftEntityCountsSchema,
});

export type DraftManifest = z.infer<typeof DraftManifestSchema>;

export type Draft = DraftManifest & {
  directoryName: string;
};
