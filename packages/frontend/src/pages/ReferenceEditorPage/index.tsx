import { useParams, useSearch } from "@tanstack/react-router";
import { ReferenceEditor } from "./components/ReferenceEditor";

export const ReferenceEditorPage = () => {
  const { projectId, referenceId } = useParams({
    from: "/projects/$projectId/references/$referenceId",
  });
  const { from: fragmentId } = useSearch({
    from: "/projects/$projectId/references/$referenceId",
  });
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <ReferenceEditor projectId={projectId} referenceId={referenceId} fragmentId={fragmentId} />
    </div>
  );
};
