import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { FragmentEditor } from "@components/fragments/fragment-editor";
import { recordFragmentVisit } from "@api/suggestion";
import { useGetFragment } from "@api/generated/fragments/fragments";
import { writeLastFragment, clearLastFragment } from "@lib/nav-state";

export const FragmentPage = () => {
  const from = "/projects/$projectId/fragments/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

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
        projectId={projectId}
        fragmentId={fragmentId}
        onDirtyChange={setIsDirty}
      />
    </>
  );
};
