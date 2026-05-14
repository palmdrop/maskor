import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { FragmentEditor } from "@components/fragments/fragment-editor";
import { recordFragmentVisit } from "@api/suggestion";

export const FragmentPage = () => {
  const from = "/projects/$projectId/fragments/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // StrictMode double-invokes effects; guard so the visit is recorded exactly once per mount.
  const hasRecordedVisitRef = useRef(false);
  useEffect(() => {
    if (hasRecordedVisitRef.current) return;
    hasRecordedVisitRef.current = true;
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
