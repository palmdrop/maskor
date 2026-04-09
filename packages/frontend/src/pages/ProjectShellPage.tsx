import { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useListFragments, getListFragmentsQueryKey } from "../api/generated/fragments/fragments";
import { useRebuildIndex } from "../api/generated/index/index";
import { FragmentList } from "../components/FragmentList";
import { FragmentDetail } from "../components/FragmentDetail";

export function ProjectShellPage() {
  const queryClient = useQueryClient();
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const [isRebuilding, setIsRebuilding] = useState(false);

  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);

  const rebuildMutation = useRebuildIndex({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
      },
    },
  });

  const { mutate: triggerRebuild } = rebuildMutation;

  // Trigger a full index rebuild on every project load as a stopgap until the file watcher
  // keeps the index live. Fires twice in dev due to StrictMode — this is expected, not a bug.
  useEffect(() => {
    if (isRebuilding) return;
    setIsRebuilding(true);

    triggerRebuild({ projectId }, {});
  }, [projectId, triggerRebuild, isRebuilding]);

  const { data: envelope, isLoading, isError } = useListFragments(projectId);

  if (isLoading) {
    return <p>Loading fragments...</p>;
  }

  if (isError || !envelope) {
    return <p>Failed to load fragments.</p>;
  }

  const fragments = envelope.status === 200 ? envelope.data : [];

  return (
    <div style={{ display: "flex", gap: "1rem" }}>
      <div style={{ flex: "0 0 300px" }}>
        <FragmentList
          fragments={fragments}
          selectedId={selectedFragmentId}
          onSelect={setSelectedFragmentId}
        />
      </div>
      <div style={{ flex: 1 }}>
        {selectedFragmentId ? (
          <FragmentDetail projectId={projectId} fragmentId={selectedFragmentId} />
        ) : (
          <p>Select a fragment.</p>
        )}
      </div>
    </div>
  );
}
