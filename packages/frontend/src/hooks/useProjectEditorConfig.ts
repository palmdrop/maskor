import { useGetProject } from "../api/generated/projects/projects";

export type ProjectEditorConfig = {
  vimMode: boolean;
  rawMarkdownMode: boolean;
  fontSize: number;
  maxParagraphWidth: number;
};

export const useProjectEditorConfig = (projectId: string): ProjectEditorConfig => {
  const { data: envelope } = useGetProject(projectId);
  const project = envelope?.status === 200 ? envelope.data : null;
  return {
    vimMode: project?.editor?.vimMode ?? false,
    rawMarkdownMode: project?.editor?.rawMarkdownMode ?? false,
    fontSize: project?.editor?.fontSize ?? 16,
    maxParagraphWidth: project?.editor?.maxParagraphWidth ?? 72,
  };
};
