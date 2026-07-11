import { z } from "@hono/zod-openapi";
import {
  SequenceCreateSchema as DomainSequenceCreateSchema,
  SequenceUpdateSchema as DomainSequenceUpdateSchema,
  FragmentPositionCreateSchema as DomainFragmentPositionCreateSchema,
  FragmentPositionMoveSchema as DomainFragmentPositionMoveSchema,
} from "@maskor/shared";

const FragmentPositionSchema = z
  .object({
    uuid: z.uuid(),
    fragmentUuid: z.uuid(),
    position: z.number().int().min(0),
  })
  .openapi("FragmentPosition");

const SectionSchema = z
  .object({
    uuid: z.uuid(),
    name: z.string(),
    fragments: z.array(FragmentPositionSchema),
  })
  .openapi("Section");

const SequenceOriginSchema = z
  .object({
    fileName: z.string().openapi({ example: "chapter-one.docx" }),
    archivePath: z.string().openapi({ example: ".maskor/imports/a1b2c3d4.docx" }),
    format: z.enum(["markdown", "docx", "plaintext"]),
    importedAt: z.string().openapi({ example: "2026-05-31T10:00:00.000Z" }),
  })
  .openapi("SequenceOrigin");

export const SequenceSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "Main Sequence" }),
    isMain: z.boolean(),
    active: z.boolean(),
    origin: SequenceOriginSchema.optional(),
    projectUuid: z.uuid(),
    filePath: z.string(),
    contentHash: z.string(),
    sections: z.array(SectionSchema),
  })
  .openapi("Sequence");

export const SequenceSummarySchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "Main Sequence" }),
    isMain: z.boolean(),
    active: z.boolean(),
    origin: SequenceOriginSchema.optional(),
    filePath: z.string(),
  })
  .openapi("SequenceSummary");

export const SequenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});

export const SequenceFragmentParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
  fragmentUuid: z.uuid(),
});

export const SequenceCreateSchema = DomainSequenceCreateSchema.extend({
  name: z.string().min(1).openapi({ example: "Main Sequence" }),
}).openapi("SequenceCreate");

export const SequenceUpdateSchema = DomainSequenceUpdateSchema.extend({
  name: z.string().min(1).optional().openapi({ example: "Revised Order" }),
  isMain: z.boolean().optional(),
}).openapi("SequenceUpdate");

export const FragmentPositionCreateSchema = DomainFragmentPositionCreateSchema.extend({
  fragmentUuid: z.uuid().openapi({ example: "aaaaaaaa-0000-0000-0000-000000000001" }),
  sectionUuid: z.uuid().openapi({ example: "bbbbbbbb-0000-0000-0000-000000000001" }),
  position: z.number().int().min(0).openapi({ example: 0 }),
}).openapi("FragmentPositionCreate");

export const FragmentPositionMoveSchema = DomainFragmentPositionMoveSchema.extend({
  sectionUuid: z.uuid().openapi({ example: "bbbbbbbb-0000-0000-0000-000000000001" }),
  position: z.number().int().min(0).openapi({ example: 1 }),
}).openapi("FragmentPositionMove");

export const SectionCreateSchema = z
  .object({ name: z.string().openapi({ example: "" }) })
  .openapi("SectionCreate");

export const SectionRenameSchema = z
  .object({ name: z.string().openapi({ example: "Act One" }) })
  .openapi("SectionRename");

export const SectionReorderSchema = z
  .object({ position: z.number().int().min(0).openapi({ example: 1 }) })
  .openapi("SectionReorder");

// Group a set of already-placed fragments into a new section.
export const FragmentsGroupSchema = z
  .object({
    fragmentUuids: z
      .array(z.uuid())
      .min(1)
      .openapi({
        example: ["aaaaaaaa-0000-0000-0000-000000000001"],
      }),
    name: z.string().openapi({ example: "Act One" }),
  })
  .openapi("FragmentsGroup");

// Move a set of already-placed fragments into an existing section as a block.
export const FragmentsMoveSchema = z
  .object({
    fragmentUuids: z
      .array(z.uuid())
      .min(1)
      .openapi({
        example: ["aaaaaaaa-0000-0000-0000-000000000001"],
      }),
    sectionUuid: z.uuid().openapi({ example: "bbbbbbbb-0000-0000-0000-000000000001" }),
    position: z.number().int().min(0).openapi({ example: 0 }),
  })
  .openapi("FragmentsMove");

// Split a section at a marked fragment, inserting a new section boundary.
export const SectionSplitSchema = z
  .object({
    fragmentUuid: z.uuid().openapi({ example: "aaaaaaaa-0000-0000-0000-000000000001" }),
    name: z.string().openapi({ example: "Act Two" }),
  })
  .openapi("SectionSplit");

// Clone a sequence into a fresh independent copy with a new name.
export const SequenceCloneSchema = z
  .object({ name: z.string().min(1).openapi({ example: "Revised Order (copy)" }) })
  .openapi("SequenceClone");

// Generate a new sequence by shuffling all non-discarded fragments into a random
// order that honors the ordering constraints of the chosen non-main sequences.
export const SequenceGenerateSchema = z
  .object({
    name: z.string().min(1).optional().openapi({ example: "Shuffle 1" }),
    constraintSequenceIds: z
      .array(z.uuid())
      .default([])
      .openapi({
        description:
          "Non-main sequences whose relative ordering the shuffle must honor. Empty = a free shuffle.",
      }),
  })
  .openapi("SequenceGenerate");

// Insert another sequence's sections into this one at a section index.
export const SequenceInsertSchema = z
  .object({
    sourceSequenceId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    sectionIndex: z.number().int().min(0).openapi({ example: 1 }),
  })
  .openapi("SequenceInsert");

export const SectionUUIDParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
  sectionId: z.uuid(),
});

export const ViolationSchema = z
  .object({
    fragmentUuid: z.uuid(),
    predecessorUuid: z.uuid(),
    secondaryUuid: z.uuid(),
  })
  .openapi("Violation");

export const CycleSchema = z
  .object({
    sequenceUuids: z.array(z.uuid()),
    fragmentUuids: z.array(z.uuid()),
  })
  .openapi("Cycle");

export const SequenceBundledResponseSchema = z
  .object({
    sequences: z.array(SequenceSchema),
    violations: z.array(ViolationSchema),
    cycles: z.array(CycleSchema),
  })
  .openapi("SequenceBundledResponse");

// One fragment's full markdown body, keyed by uuid. Used by the vertical
// Overview spine to render and reorder prose client-side per fragment.
export const SequenceFragmentContentSchema = z
  .object({
    fragmentUuid: z.uuid(),
    key: z.string(),
    content: z.string(),
  })
  .openapi("SequenceFragmentContent");

// Per-fragment bulk content for a sequence: the placed fragments in sequence
// order (sections in order, fragments by position), plus the unassigned-pool
// fragments (non-discarded, not placed in this sequence).
export const SequenceContentsResponseSchema = z
  .object({
    placed: z.array(SequenceFragmentContentSchema),
    pool: z.array(SequenceFragmentContentSchema),
  })
  .openapi("SequenceContentsResponse");
