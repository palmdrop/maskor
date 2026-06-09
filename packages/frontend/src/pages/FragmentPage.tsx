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

  // StrictMode double-invokes effects; guard so the visit is recorded exactly once per mount.
  const hasRecordedVisitRef = useRef(false);
  useEffect(() => {
    if (hasRecordedVisitRef.current) return;
    hasRecordedVisitRef.current = true;
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
