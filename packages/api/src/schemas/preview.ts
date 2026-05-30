import { z } from "@hono/zod-openapi";

// Lean navigation entry — id + display key only, no fragment content. The
// content lives entirely in the assembled `markdown` string.
const PreviewNavFragmentSchema = z
  .object({
    uuid: z.string().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "the-crossing" }),
  })
  .openapi("PreviewNavFragment");

const PreviewNavSectionSchema = z
  .object({
    uuid: z.string().openapi({ example: "b2c3d4e5-f6a7-8901-bcde-f12345678901" }),
    name: z.string().openapi({ example: "Part One" }),
    fragments: z.array(PreviewNavFragmentSchema),
  })
  .openapi("PreviewNavSection");

export const PreviewResultSchema = z
  .object({
    markdown: z.string().openapi({
      example: "## Part One\n\n### the-crossing\n\nThe river was wide that morning.",
    }),
    sections: z.array(PreviewNavSectionSchema),
  })
  .openapi("PreviewResult");

export const PreviewSequenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});

const booleanQuery = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .optional()
    .default(fallback)
    .transform((value) => value === "true");

// Toggle options are passed explicitly per request — the server never reads
// `project.json`. Preview only sends the first three separators; the assembler
// type models the full export superset.
export const PreviewSequenceQuerySchema = z.object({
  showTitles: booleanQuery("false"),
  showSectionHeadings: booleanQuery("true"),
  separator: z.enum(["none", "blank-line", "horizontal-rule"]).optional().default("blank-line"),
});
