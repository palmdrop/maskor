import { useGetProject } from "@api/generated/projects/projects";
import type { LanguageCode } from "@maskor/shared";

export type ProjectEditorConfig = {
  vimMode: boolean;
  rawMarkdownMode: boolean;
  fontSize: number;
  marginFontSize: number;
  maxParagraphWidth: number;
  vimClipboardSync: boolean;
  // Project-wide writing language (BCP-47); empty string = browser/OS default. Always a catalog member
  // (the API validates on read and the fallback below is `""`), so downstream needs no runtime guard.
  language: LanguageCode;
};

export const useProjectEditorConfig = (projectId: string): ProjectEditorConfig => {
  const { data: envelope } = useGetProject(projectId);
  const project = envelope?.status === 200 ? envelope.data : null;
  return {
    vimMode: project?.editor?.vimMode ?? false,
    rawMarkdownMode: project?.editor?.rawMarkdownMode ?? false,
    fontSize: project?.editor?.fontSize ?? 16,
    marginFontSize: project?.editor?.marginFontSize ?? 15,
    maxParagraphWidth: project?.editor?.maxParagraphWidth ?? 72,
    vimClipboardSync: project?.editor?.vimClipboardSync ?? true,
    language: project?.editor?.language ?? "",
  };
};
