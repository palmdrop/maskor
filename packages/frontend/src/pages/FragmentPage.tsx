import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { FragmentEditor, type FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { recordFragmentVisit } from "@api/suggestion";
import { useGetFragment } from "@api/generated/fragments/fragments";
import { writeLastFragment, clearLastFragment } from "@lib/nav-state";
import { useFragmentListOrder } from "@contexts/FragmentListOrderContext";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { fragmentNavScope } from "@lib/commands/scopes/fragment-nav";

export const FragmentPage = () => {
  const from = "/projects/$projectId/fragments/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });
  const navigate = useNavigate();

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const editorRef = useRef<FragmentEditorHandle>(null);

  // Previous/Next over exactly the order FragmentListPage currently renders. The
  // active fragment lives in the route param; if it has been filtered out of the
  // list, both directions clamp to disabled.
  const order = useFragmentListOrder();
  const currentIndex = order ? order.indexOf(fragmentId) : -1;
  const previousUuid = currentIndex > 0 ? order![currentIndex - 1] : null;
  const nextUuid =
    currentIndex >= 0 && order && currentIndex < order.length - 1 ? order[currentIndex + 1] : null;

  const goToFragment = useCallback(
    (uuid: string) => {
      void navigate({
        to: "/projects/$projectId/fragments/$fragmentId",
        params: { projectId, fragmentId: uuid },
      });
    },
    [navigate, projectId],
  );

  const saveEditor = useCallback(async () => {
    await editorRef.current?.save();
  }, []);

  const commands = useCommands();
  useCommandScope(fragmentNavScope, {
    hasNext: nextUuid !== null,
    hasPrevious: previousUuid !== null,
    nextUuid,
    previousUuid,
    save: saveEditor,
    goToFragment,
  });

  const navigation = useMemo(
    () => ({
      onPrevious: () => commands.run("fragments:previous"),
      onNext: () => commands.run("fragments:next"),
      hasPrevious: previousUuid !== null,
      hasNext: nextUuid !== null,
    }),
    [commands, previousUuid, nextUuid],
  );

  // Tap into the same cache entry as FragmentEditor (no extra request) to detect
  // when the fragment no longer exists and clear the stored navigation slot so the
  // navbar does not loop back to a deleted fragment.
  const { isError: fragmentNotFound } = useGetFragment(projectId, fragmentId);
  useEffect(() => {
    if (fragmentNotFound) clearLastFragment(projectId);
  }, [projectId, fragmentNotFound]);

  // The route reuses this component instance across fragment changes (no `key` on
  // the route), so guard on the fragmentId itself rather than a once-per-mount
  // flag — otherwise only the first fragment opened would be persisted/recorded.
  // Tracking the id also dedupes StrictMode's double-invoke (same id, no-op).
  const recordedFragmentIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (recordedFragmentIdRef.current === fragmentId) return;
    recordedFragmentIdRef.current = fragmentId;
    writeLastFragment(projectId, fragmentId);
    void recordFragmentVisit(projectId, fragmentId).catch(() => {
      // Non-critical; ignore failures.
    });
  }, [projectId, fragmentId]);

  return (
    <>
      <FragmentEditor
        key={fragmentId}
        ref={editorRef}
        projectId={projectId}
        fragmentId={fragmentId}
        navigation={navigation}
        onDirtyChange={setIsDirty}
      />
    </>
  );
};
