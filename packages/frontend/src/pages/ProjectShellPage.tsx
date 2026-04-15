import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useListFragments } from "../api/generated/fragments/fragments";
import { FragmentList } from "../components/fragments/FragmentList";
import { FragmentDetail } from "../components/fragments/FragmentDetail";
import { useVaultEvents } from "../hooks/useVaultEvents";

export function ProjectShellPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });

  useVaultEvents(projectId);

  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);

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
