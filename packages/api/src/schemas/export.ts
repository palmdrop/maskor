import { z } from "@hono/zod-openapi";

export const ExportSequenceParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});

export const ExportSequenceBodySchema = z
  .object({
    format: z.enum(["md", "txt", "docx"]).openapi({
      description: "Output format for the exported file",
      example: "md",
    }),
  })
  .openapi("ExportSequenceBody");
