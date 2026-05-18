import { useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
} from "@api/generated/projects/projects";
import { useListSequences } from "@api/generated/sequences/sequences";
import { useGetAssembledSequence } from "@api/generated/preview/preview";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewSidebar } from "./PreviewSidebar";
import { PreviewProse } from "./PreviewProse";
import {
  ProjectPreviewSeparator,
  type ProjectUpdatePreviewSeparator as SeparatorType,
} from "@api/generated/maskorAPI.schemas";

type PreviewConfig = {
  showTitles: boolean;
  showSectionHeadings: boolean;
  separator: SeparatorType;
};

export const PreviewPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/preview" });
  const { sequence: sequenceParam } = useSearch({ from: "/projects/$projectId/preview" });
  const { fontSize, maxParagraphWidth } = useProjectEditorConfig(projectId);
  const queryClient = useQueryClient();

  const { data: projectEnvelope } = useGetProject(projectId);
  const project = projectEnvelope?.status === 200 ? projectEnvelope.data : null;

  const { data: sequencesBundleEnvelope } = useListSequences(projectId);
  const sequences =
    sequencesBundleEnvelope?.status === 200 ? sequencesBundleEnvelope.data.sequences : [];

  const mainSequence = sequences.find((sequence) => sequence.isMain) ?? null;
  const activeSequenceUuid = sequenceParam ?? mainSequence?.uuid ?? null;

  const serverPreview: PreviewConfig = project?.preview ?? {
    showTitles: false,
    showSectionHeadings: true,
    separator: ProjectPreviewSeparator["blank-line"],
  };

  const [localOverride, setLocalOverride] = useState<Partial<PreviewConfig>>({});
  const preview: PreviewConfig = { ...serverPreview, ...localOverride };

  const { mutate: updateProject } = useUpdateProject({
    mutation: {
      onSuccess: () => {
        setLocalOverride({});
        void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
      onError: () => {
        setLocalOverride({});
      },
    },
  });

  const handlePreviewPatch = (patch: Partial<PreviewConfig>) => {
    setLocalOverride((previous) => ({ ...previous, ...patch }));
    updateProject({ projectId, data: { preview: patch } });
  };

  const { data: assembledEnvelope } = useGetAssembledSequence(
    projectId,
    activeSequenceUuid ?? "",
    { query: { enabled: !!activeSequenceUuid } },
  );

  const assembled = assembledEnvelope?.status === 200 ? assembledEnvelope.data : null;

  const hasSections = assembled
    ? assembled.sections.some((section) => section.name.trim().length > 0)
    : false;

  if (assembledEnvelope?.status === 404) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">This sequence no longer exists.</p>
      </div>
    );
  }

  if (!assembled) {
    return null;
  }

  const allFragments = assembled.sections.flatMap((section) => section.fragments);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PreviewToolbar
        sequences={sequences}
        activeSequenceUuid={activeSequenceUuid ?? ""}
        projectId={projectId}
        showTitles={preview.showTitles}
        showSectionHeadings={preview.showSectionHeadings}
        separator={preview.separator}
        hasSections={hasSections}
        onPatch={handlePreviewPatch}
      />
      <div className="flex flex-1 min-h-0">
        <PreviewSidebar assembled={assembled} />
        <main className="flex-1 overflow-y-auto">
          {allFragments.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Sequence empty.</p>
            </div>
          ) : (
            <PreviewProse
              assembled={assembled}
              showTitles={preview.showTitles}
              showSectionHeadings={preview.showSectionHeadings}
              separator={preview.separator}
              fontSize={fontSize}
              maxParagraphWidth={maxParagraphWidth}
            />
          )}
        </main>
      </div>
    </div>
  );
};
