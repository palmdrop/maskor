import { useParams } from "@tanstack/react-router";
import { FragmentEditor } from "../components/fragments/fragment-editor";

export function FragmentPage() {
  const from = "/projects/$projectId/fragment/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  return <FragmentEditor projectId={projectId} fragmentId={fragmentId} />;
}
