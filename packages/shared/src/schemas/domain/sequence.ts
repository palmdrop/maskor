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

export const SequenceOriginSchema = z.object({
  fileName: z.string(),
  archivePath: z.string(),
  format: z.enum(["markdown", "docx", "plaintext"]),
  importedAt: z.string(),
});

export type SequenceOrigin = z.infer<typeof SequenceOriginSchema>;

export const SequenceSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  isMain: z.boolean(),
  active: z.boolean(),
  projectUuid: z.string().uuid(),
  sections: z.array(SectionSchema),
  origin: SequenceOriginSchema.optional(),
});

export type Sequence = z.infer<typeof SequenceSchema>;

// An import-sequence — a sequence carrying an `origin` — is a read-only snapshot
// of its original import order: its placements and section structure are frozen.
// To build on it the user clones it first. This predicate is the single source of
// truth for the condition, shared by the backend (where `@maskor/sequencer`'s
// `assertSequenceMutable` enforces it) and the frontend (which mirrors it in the
// UI). Typed structurally so both the domain `Sequence` and the orval-generated
// schema type satisfy it without coupling to either.
export const isSequenceReadOnly = (sequence: { origin?: unknown }): boolean =>
  sequence.origin !== undefined;

export const SequenceCreateSchema = z.object({
  name: z.string().min(1),
  isMain: z.boolean().default(false),
  active: z.boolean().default(true),
  projectUuid: z.string().uuid(),
  origin: SequenceOriginSchema.optional(),
});

export type SequenceCreate = z.infer<typeof SequenceCreateSchema>;

export const SequenceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  isMain: z.boolean().optional(),
  active: z.boolean().optional(),
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

export const ViolationSchema = z.object({
  fragmentUuid: z.string().uuid(),
  predecessorUuid: z.string().uuid(),
  secondaryUuid: z.string().uuid(),
});

export type Violation = z.infer<typeof ViolationSchema>;

export const CycleSchema = z.object({
  sequenceUuids: z.array(z.string().uuid()),
  fragmentUuids: z.array(z.string().uuid()),
});

export type Cycle = z.infer<typeof CycleSchema>;
