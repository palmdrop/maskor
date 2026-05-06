import { useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { FragmentEditor } from "../components/fragments/fragment-editor";

export const FragmentPage = () => {
  const from = "/projects/$projectId/fragments/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

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
