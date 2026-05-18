import { z } from "@hono/zod-openapi";

const AssembledFragmentSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "the-crossing" }),
    content: z.string().openapi({ example: "The river was wide that morning." }),
  })
  .openapi("AssembledFragment");

const AssembledSectionSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "b2c3d4e5-f6a7-8901-bcde-f12345678901" }),
    name: z.string().openapi({ example: "Part One" }),
    fragments: z.array(AssembledFragmentSchema),
  })
  .openapi("AssembledSection");

export const AssembledSequenceSchema = z
  .object({
    sequenceUuid: z.uuid().openapi({ example: "c3d4e5f6-a7b8-9012-cdef-123456789012" }),
    sequenceName: z.string().openapi({ example: "Main Sequence" }),
    isMain: z.boolean(),
    sections: z.array(AssembledSectionSchema),
  })
  .openapi("AssembledSequence");

export const PreviewSequenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});
