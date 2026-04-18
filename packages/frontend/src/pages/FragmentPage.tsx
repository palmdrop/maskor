import { useParams } from "@tanstack/react-router";
import { FragmentDetail } from "../components/fragments/fragment-detail";

export function FragmentPage() {
  const from = "/projects/$projectId/fragment/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  console.log("FRAGMNET PAGE");

  return <FragmentDetail projectId={projectId} fragmentId={fragmentId} />;
}
