import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import {
  fragmentNavScope,
  FRAGMENT_NAV_SAVE_FAILED_MESSAGE,
} from "@lib/commands/scopes/fragment-nav";
import { orderNeighbors } from "@lib/fragments/order-neighbors";
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
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { useFragmentAnchor } from "@hooks/useFragmentAnchor";
import { useScrollSpy } from "@hooks/useScrollSpy";
import { FragmentNavSidebar } from "@components/FragmentNavSidebar";
import { ActiveFragmentLabel } from "@components/active-fragment-label";
import { FragmentEditor, type FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { Button } from "@components/ui/button";
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
  const { navigateToAnchor } = useFragmentAnchor({ ready: previewReady });

  // --- Inline editing overlay state (ADR 0013) ---
  // Double-click opens the full fragment editor as a center-replacing overlay
  // (the assembled document unmounts; the nav sidebar stays). No markdown split.
  const [editingFragmentUuid, setEditingFragmentUuid] = useState<string | null>(null);
  const editingUuidRef = useRef<string | null>(null);
  editingUuidRef.current = editingFragmentUuid;
  // On close, scroll back to the top of the last-shown fragment once the document
  // re-renders.
  const [pendingScrollUuid, setPendingScrollUuid] = useState<string | null>(null);
  const editorRef = useRef<FragmentEditorHandle>(null);

  useEffect(() => {
    if (editingFragmentUuid || !pendingScrollUuid || !assembled) return;
    const uuid = pendingScrollUuid;
    setPendingScrollUuid(null);
    requestAnimationFrame(() => {
      document
        .getElementById(`fragment-${uuid}`)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    });
  }, [editingFragmentUuid, assembled, pendingScrollUuid]);

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

  // Active fragment = the one at the reading line (~35% down the viewport),
  // computed from anchor positions so it tracks both scroll directions and
  // resolves correctly after a reload's scroll restore. Drives the header title
  // and the sidebar highlight. Recomputes when the content or edit-mode changes
  // (no document to observe while the editor overlay is open).
  const activeFragmentId = useScrollSpy({
    rootRef: mainRef,
    enabled: previewReady,
    deps: [assembled, editingFragmentUuid],
  });

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

  // Previous/Next/Close for the editor overlay, traversing the assembled order.
  const previewOrder = useMemo(() => allFragments.map((fragment) => fragment.uuid), [allFragments]);
  const { previousUuid: previousEditUuid, nextUuid: nextEditUuid } = orderNeighbors(
    previewOrder,
    editingFragmentUuid,
  );

  const openEditor = useCallback((uuid: string) => setEditingFragmentUuid(uuid), []);
  // Retarget while editing saves the current fragment first (the same dirty guard
  // as Next/Previous); opening fresh just sets the target. A failed save aborts the
  // switch and surfaces the same toast the nav commands' onFailure shows.
  const handleEdit = useCallback((uuid: string) => {
    const current = editingUuidRef.current;
    if (current && current !== uuid && editorRef.current) {
      void editorRef.current
        .save()
        .then(() => setEditingFragmentUuid(uuid))
        .catch(() => toast.error(FRAGMENT_NAV_SAVE_FAILED_MESSAGE));
      return;
    }
    setEditingFragmentUuid(uuid);
  }, []);
  const closeEditor = useCallback(() => {
    setPendingScrollUuid(editingUuidRef.current);
    setEditingFragmentUuid(null);
  }, []);
  const saveEditor = useCallback(async () => {
    await editorRef.current?.save();
  }, []);
  const handleEditorSaved = useCallback(() => {
    if (activeSequenceUuid) {
      void queryClient.invalidateQueries({
        queryKey: getGetAssembledSequenceQueryKey(projectId, activeSequenceUuid, previewParams),
      });
    }
  }, [activeSequenceUuid, projectId, queryClient, previewParams]);

  useCommandScope(fragmentNavScope, {
    hasNext: nextEditUuid !== null,
    hasPrevious: previousEditUuid !== null,
    nextUuid: nextEditUuid,
    previousUuid: previousEditUuid,
    save: saveEditor,
    goToFragment: openEditor,
    closeEditor: editingFragmentUuid ? closeEditor : undefined,
  });

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
        <ActiveFragmentLabel
          fragmentKey={activeFragmentId ? fragmentsMap.get(activeFragmentId)?.key : undefined}
        />
      </PreviewToolbar>
      <div className="flex flex-1 min-h-0">
        <FragmentNavSidebar
          sections={assembled.sections}
          activeAnchorId={activeFragmentId}
          // While the overlay is open, a sidebar pick retargets the editor;
          // otherwise it scrolls the document to that fragment.
          onSelect={editingFragmentUuid ? handleEdit : navigateToAnchor}
          header={
            <Heading level={4} className="px-4 pt-4 pb-2">
              {allFragments.length} fragment{allFragments.length !== 1 ? "s" : ""}
            </Heading>
          }
        />
        {editingFragmentUuid ? (
          // Center-replacing editor overlay (ADR 0013). The nav sidebar stays; the
          // assembled document unmounts. Focus mode (if on) lifts the editor into a
          // fixed full-viewport layer over everything but the navbar.
          <div className="flex-1 min-h-0 overflow-hidden p-4">
            <FragmentEditor
              key={editingFragmentUuid}
              ref={editorRef}
              projectId={projectId}
              fragmentId={editingFragmentUuid}
              sidebarCollapsible
              showMargin={false}
              navigation={{
                onPrevious: () => commands.run("fragments:previous"),
                onNext: () => commands.run("fragments:next"),
                hasPrevious: previousEditUuid !== null,
                hasNext: nextEditUuid !== null,
              }}
              backNode={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => commands.run("fragments:close-editor")}
                >
                  ← Close
                </Button>
              }
              onSaved={handleEditorSaved}
            />
          </div>
        ) : (
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
            ) : (
              <PreviewProse
                markdown={assembled.markdown}
                fontSize={fontSize}
                maxParagraphWidth={maxParagraphWidth}
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
};
