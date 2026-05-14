import { z } from "zod";

export const FragmentPositionSchema = z.object({
  uuid: z.uuid(),
  fragmentUuid: z.string().uuid(),
  position: z.number().int().min(0),
});

export type FragmentPosition = z.infer<typeof FragmentPositionSchema>;

export const SectionSchema = z
  .object({
    uuid: z.uuid(),
    name: z.string(),
    fragments: z.array(FragmentPositionSchema),
  })
  .superRefine((section, ctx) => {
    const positions = section.fragments.map((f) => f.position);
    const sorted = [...positions].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section fragment positions must be dense and 0-based. Expected position ${i}, got ${sorted[i]}.`,
        });
        return;
      }
    }
    const uuids = section.fragments.map((f) => f.fragmentUuid);
    const unique = new Set(uuids);
    if (unique.size !== uuids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate fragment UUIDs in section.",
      });
    }
  });

export type Section = z.infer<typeof SectionSchema>;

export const SequenceSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  isMain: z.boolean(),
  projectUuid: z.string().uuid(),
  sections: z.array(SectionSchema),
});

export type Sequence = z.infer<typeof SequenceSchema>;

export const SequenceCreateSchema = z.object({
  name: z.string().min(1),
  isMain: z.boolean().default(false),
  projectUuid: z.string().uuid(),
});

export type SequenceCreate = z.infer<typeof SequenceCreateSchema>;

export const SequenceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  isMain: z.boolean().optional(),
});

export type SequenceUpdate = z.infer<typeof SequenceUpdateSchema>;

export const FragmentPositionCreateSchema = z.object({
  fragmentUuid: z.string().uuid(),
  sectionUuid: z.string().uuid(),
  position: z.number().int().min(0),
});

export type FragmentPositionCreate = z.infer<typeof FragmentPositionCreateSchema>;

export const FragmentPositionMoveSchema = z.object({
  sectionUuid: z.string().uuid(),
  position: z.number().int().min(0),
});

export type FragmentPositionMove = z.infer<typeof FragmentPositionMoveSchema>;
