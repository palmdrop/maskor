import { useEffect, useMemo, useRef, useState } from "react";
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
import { useFragmentAnchor } from "@hooks/useFragmentAnchor";
import { FragmentNavSidebar } from "@components/FragmentNavSidebar";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewProse } from "./PreviewProse";
import {
  ProjectPreviewSeparator,
  type GetAssembledSequenceParams,
  type PreviewNavFragment,
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

  const mainRef = useRef<HTMLElement>(null);

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

  // Toggles drive the request: options are applied server-side, so flipping one
  // changes the query key and refetches the re-assembled markdown.
  const previewParams: GetAssembledSequenceParams = {
    showTitles: preview.showTitles ? "true" : "false",
    showSectionHeadings: preview.showSectionHeadings ? "true" : "false",
    separator: preview.separator,
  };

  const { data: assembledEnvelope } = useGetAssembledSequence(
    projectId,
    activeSequenceUuid ?? "",
    previewParams,
    { query: { enabled: !!activeSequenceUuid } },
  );

  const assembled = assembledEnvelope?.status === 200 ? assembledEnvelope.data : null;

  const hasSections = assembled
    ? assembled.sections.some((section) => section.name.trim().length > 0)
    : false;

  const previewReady =
    !!assembled && assembled.sections.some((section) => section.fragments.length > 0);
  const { navigateToAnchor, activeAnchorId } = useFragmentAnchor({ ready: previewReady });

  const [activeFragmentId, setActiveFragmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!previewReady) return;
    const main = mainRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveFragmentId(entry.target.id.replace("fragment-", ""));
          }
        }
      },
      {
        root: main,
        rootMargin: "0px 0px -85% 0px",
        threshold: 0,
      },
    );

    const fragmentAnchors = [...main!.getElementsByClassName("fragment-anchor")];
    fragmentAnchors.forEach((anchor) => observer.observe(anchor));
  }, [previewReady]);

  const allFragments = useMemo(
    () => assembled?.sections.flatMap((section) => section.fragments) ?? [],
    [assembled],
  );

  const fragmentsMap = useMemo(() => {
    return allFragments?.reduce((map, fragment) => {
      map.set(fragment.uuid, fragment);
      return map;
    }, new Map<string, PreviewNavFragment>());
  }, [allFragments]);

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
      >
        {activeFragmentId && fragmentsMap.get(activeFragmentId ?? activeAnchorId)?.key}
      </PreviewToolbar>
      <div className="flex flex-1 min-h-0">
        <FragmentNavSidebar
          sections={assembled.sections}
          activeAnchorId={activeFragmentId}
          onSelect={navigateToAnchor}
          header={
            <div className="px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {allFragments.length} fragment{allFragments.length !== 1 ? "s" : ""}
            </div>
          }
        />
        <main className="flex-1 overflow-y-auto" ref={mainRef}>
          {allFragments.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Sequence empty.</p>
            </div>
          ) : (
            <PreviewProse
              markdown={assembled.markdown}
              fontSize={fontSize}
              maxParagraphWidth={maxParagraphWidth}
            />
          )}
        </main>
      </div>
    </div>
  );
};
