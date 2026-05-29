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

export const SequenceSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "Main Sequence" }),
    isMain: z.boolean(),
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
