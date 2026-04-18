import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useListFragments } from "../api/generated/fragments/fragments";
import { FragmentList } from "../components/fragments/fragment-list";
import { FragmentDetail } from "../components/fragments/fragment-detail";
import { useVaultEvents } from "../hooks/useVaultEvents";

export function ProjectShellPage() {
  const from = "/projects/$projectId" as const;
  const navigate = useNavigate({ from });
  const { projectId } = useParams({ from });
  const { fragment: fragmentId } = useSearch({ from });

  useVaultEvents(projectId);

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
          selectedId={fragmentId}
          onSelect={(id) => {
            navigate({
              search: { fragment: id },
            });
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        {fragmentId ? (
          <>
            <Link to="/projects/$projectId/fragment/$fragmentId" params={{ projectId, fragmentId }}>
              Open fragment
            </Link>
            <FragmentDetail projectId={projectId} fragmentId={fragmentId} />
          </>
        ) : (
          <p>Select a fragment.</p>
        )}
      </div>
    </div>
  );
}
