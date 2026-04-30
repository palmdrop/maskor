import { useParams } from "@tanstack/react-router";
import { AspectEditor } from "./components/AspectEditor";

export const AspectEditorPage = () => {
  const { projectId, aspectId } = useParams({ from: "/projects/$projectId/aspects/$aspectId" });
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-6">
      <AspectEditor projectId={projectId} aspectId={aspectId} />
    </div>
  );
};
