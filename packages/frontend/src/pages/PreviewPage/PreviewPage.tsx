import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommands } from "@lib/commands/useCommands";
import { usePersistedScroll } from "@hooks/usePersistedScroll";
import { Heading } from "@components/heading";
import { writePreviewSequence, previewScrollKey } from "@lib/nav-state";
import { useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
} from "@api/generated/projects/projects";
import { useListSequences } from "@api/generated/sequences/sequences";
import {
  useGetAssembledSequence,
  getGetAssembledSequenceQueryKey,
} from "@api/generated/preview/preview";
import {
  useGetFragment,
  useUpdateFragment,
  getGetFragmentQueryKey,
} from "@api/generated/fragments/fragments";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { useFragmentAnchor } from "@hooks/useFragmentAnchor";
import { FragmentNavSidebar } from "@components/FragmentNavSidebar";
import { ReadonlyProse } from "@components/readonly-prose";
import { InlineFragmentEditor } from "@components/inline-fragment-editor";
import { PreviewToolbar } from "./PreviewToolbar";
import { PreviewProse } from "./PreviewProse";
import { splitAroundFragment } from "@lib/preview/split-around-fragment";
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
  const commands = useCommands();

  const { data: projectEnvelope } = useGetProject(projectId);
  const project = projectEnvelope?.status === 200 ? projectEnvelope.data : null;

  const { data: sequencesBundleEnvelope } = useListSequences(projectId);
  const sequences =
    sequencesBundleEnvelope?.status === 200 ? sequencesBundleEnvelope.data.sequences : [];

  const mainSequence = sequences.find((sequence) => sequence.isMain) ?? null;
  const activeSequenceUuid = sequenceParam ?? mainSequence?.uuid ?? null;

  // Persist sequence whenever it resolves.
  useEffect(() => {
    if (activeSequenceUuid) writePreviewSequence(projectId, activeSequenceUuid);
  }, [projectId, activeSequenceUuid]);

  // Scroll persistence hook — key is stable; restore effect runs after assembled is defined below.
  const persistedScroll = usePersistedScroll(previewScrollKey(projectId));
  const hasRestoredScrollRef = useRef(false);

  const serverPreview: PreviewConfig = project?.preview ?? {
    showTitles: false,
    showSectionHeadings: true,
    separator: ProjectPreviewSeparator["blank-line"],
  };

  // Not a server mirror but an optimistic overlay: a flipped preview toggle applies instantly
  // here (so the control and the assembled-markdown query key update without waiting for the
  // round-trip), then clears on settle so the authoritative server value takes back over. This
  // is why it is not folded into useProjectSetting (which is invalidate-only) — the instant
  // overlay coupled to the query is the point. See onSuccess/onError below.
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

  // Restore scroll after the first time assembled content renders.
  useEffect(() => {
    if (!assembled || hasRestoredScrollRef.current) return;
    hasRestoredScrollRef.current = true;
    const offset = persistedScroll.read();
    if (offset === null) return;
    requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = offset;
    });
  }, [assembled, persistedScroll]);

  const hasSections = assembled
    ? assembled.sections.some((section) => section.name.trim().length > 0)
    : false;

  const previewReady =
    !!assembled && assembled.sections.some((section) => section.fragments.length > 0);
  const { navigateToAnchor, activeAnchorId } = useFragmentAnchor({ ready: previewReady });

  const [activeFragmentId, setActiveFragmentId] = useState<string | null>(null);

  // --- Inline editing state ---
  const [editingFragmentUuid, setEditingFragmentUuid] = useState<string | null>(null);
  const [isSavingFragment, setIsSavingFragment] = useState(false);
  // After save, track which fragment to scroll to once the refetch renders.
  const [pendingScrollUuid, setPendingScrollUuid] = useState<string | null>(null);

  // Fetch the raw body of the fragment being edited (the assembled markdown is NOT
  // the raw body — titles/headings/separators are injected, anchors stripped).
  const { data: editingFragmentEnvelope } = useGetFragment(projectId, editingFragmentUuid ?? "", {
    query: { enabled: !!editingFragmentUuid },
  });
  const editingFragment =
    editingFragmentEnvelope?.status === 200 ? editingFragmentEnvelope.data : null;

  const { mutateAsync: updateFragment } = useUpdateFragment();

  // Scroll to the saved fragment once the assembled markdown refetches and renders.
  useEffect(() => {
    if (!pendingScrollUuid || !assembled) return;
    const uuid = pendingScrollUuid;
    setPendingScrollUuid(null);
    // Defer one tick so the ReadonlyProse has finished rendering the new content.
    requestAnimationFrame(() => {
      document
        .getElementById(`fragment-${uuid}`)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    });
  }, [assembled, pendingScrollUuid]);

  const handleSaveFragment = useCallback(
    async (content: string) => {
      if (!editingFragmentUuid || !activeSequenceUuid) return;
      setIsSavingFragment(true);
      try {
        await updateFragment({
          projectId,
          fragmentId: editingFragmentUuid,
          data: { content },
        });
        // Invalidate the assembled sequence so the preview reloads with updated content.
        await queryClient.invalidateQueries({
          queryKey: getGetAssembledSequenceQueryKey(projectId, activeSequenceUuid, previewParams),
        });
        // Invalidate the fragment cache so stale raw body is not served if re-opened.
        await queryClient.invalidateQueries({
          queryKey: getGetFragmentQueryKey(projectId, editingFragmentUuid),
        });
        setPendingScrollUuid(editingFragmentUuid);
        setEditingFragmentUuid(null);
      } finally {
        setIsSavingFragment(false);
      }
    },
    [
      editingFragmentUuid,
      activeSequenceUuid,
      projectId,
      updateFragment,
      queryClient,
      previewParams,
    ],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingFragmentUuid(null);
  }, []);

  // Resolve the double-clicked fragment UUID from the nearest preceding
  // `.fragment-anchor` element (the invisible sentinel nodes rendered by
  // FragmentAnchor). Clicks before any anchor or inside injected headings → null.
  const resolveFragmentFromDoubleClick = useCallback((event: React.MouseEvent): string | null => {
    const main = mainRef.current;
    if (!main) return null;
    const target = event.target as Node;
    const anchors = [...main.getElementsByClassName("fragment-anchor")];
    // Among all anchors that precede the click target, pick the last one (the
    // nearest one). `compareDocumentPosition` bit 4 (DOCUMENT_POSITION_FOLLOWING)
    // is set when the argument follows the reference node.
    const preceding = anchors.filter(
      (anchor) => anchor.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const nearest = preceding.at(-1) as Element | undefined;
    if (!nearest) return null;
    const id = nearest.id;
    if (!id.startsWith("fragment-")) return null;
    return id.slice("fragment-".length);
  }, []);

  const handleMainDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Block opening a second editor while one is already open.
      if (editingFragmentUuid) return;
      const uuid = resolveFragmentFromDoubleClick(event);
      if (!uuid) return;
      setEditingFragmentUuid(uuid);
    },
    [editingFragmentUuid, resolveFragmentFromDoubleClick],
  );

  useEffect(() => {
    if (!previewReady) return;
    const main = mainRef.current;
    // In editing mode the assembled markdown is split across two ReadonlyProse
    // instances; observe the anchors in both.
    const fragmentAnchors = [...main!.getElementsByClassName("fragment-anchor")];

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

    fragmentAnchors.forEach((anchor) => observer.observe(anchor));
    return () => observer.disconnect();
  }, [previewReady, assembled, editingFragmentUuid]);

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

  const editSplit = useMemo(() => {
    if (!assembled || !editingFragmentUuid || !editingFragment) return null;
    return splitAroundFragment(assembled.markdown, editingFragmentUuid);
  }, [assembled, editingFragmentUuid, editingFragment]);

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
        onExport={() => {
          const activeSequence = sequences.find((sequence) => sequence.uuid === activeSequenceUuid);
          if (activeSequence) {
            commands.run("project:export", activeSequence);
          }
        }}
      >
        {activeFragmentId && fragmentsMap.get(activeFragmentId ?? activeAnchorId)?.key}
      </PreviewToolbar>
      <div className="flex flex-1 min-h-0">
        <FragmentNavSidebar
          sections={assembled.sections}
          activeAnchorId={activeFragmentId}
          onSelect={navigateToAnchor}
          header={
            <Heading level={4} className="px-4 pt-4 pb-2">
              {allFragments.length} fragment{allFragments.length !== 1 ? "s" : ""}
            </Heading>
          }
        />
        {}
        <main
          className="flex-1 overflow-y-auto"
          ref={mainRef}
          onDoubleClick={handleMainDoubleClick}
          onScroll={() => {
            if (mainRef.current) persistedScroll.save(mainRef.current.scrollTop);
          }}
        >
          {allFragments.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Sequence empty.</p>
            </div>
          ) : editSplit ? (
            // Inline editing: split the assembled markdown around the edited fragment.
            // Two ReadonlyProse instances flank the InlineFragmentEditor in normal
            // document flow so the editor expands/reflows naturally as text is added.
            <div className="py-6 px-6">
              <ReadonlyProse
                content={editSplit.before}
                fontSize={fontSize}
                maxParagraphWidth={maxParagraphWidth}
              />
              <div
                className="mx-auto w-full border rounded-md p-3 my-4"
                style={{ maxWidth: `${maxParagraphWidth}ch`, fontSize: `${fontSize}px` }}
              >
                <InlineFragmentEditor
                  projectId={projectId}
                  content={editingFragment!.content}
                  onSave={handleSaveFragment}
                  onCancel={handleCancelEdit}
                  isSaving={isSavingFragment}
                />
              </div>
              <ReadonlyProse
                content={editSplit.after}
                fontSize={fontSize}
                maxParagraphWidth={maxParagraphWidth}
              />
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
