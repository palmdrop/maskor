import { useState, useCallback } from "react";
import { Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFragments,
  useDiscardFragment,
  useRestoreFragment,
  getListFragmentsQueryKey,
} from "../api/generated/fragments/fragments";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export function FragmentListPage() {
  const from = "/projects/$projectId/fragments" as const;
  const { projectId } = useParams({ from });
  const queryClient = useQueryClient();

  const { data: envelope, isLoading, isError } = useListFragments(projectId);
  const { mutate: discardFragment } = useDiscardFragment();
  const { mutate: restoreFragment } = useRestoreFragment();

  const [filter, setFilter] = useState("");

  const location = useRouterState({ select: (s) => s.location.pathname });
  const fragmentIdMatch = location.match(/\/projects\/[^/]+\/fragments\/([^/]+)/);
  const activeFragmentId = fragmentIdMatch ? fragmentIdMatch[1] : null;

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) }),
    [queryClient, projectId],
  );

  if (isLoading) return <p>Loading fragments…</p>;
  if (isError || !envelope) return <p>Failed to load fragments.</p>;

  const fragments = envelope.status === 200 ? envelope.data : [];
  const filtered = filter
    ? fragments.filter((f) => f.title.toLowerCase().includes(filter.toLowerCase()))
    : fragments;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col gap-3 w-72 shrink-0 border-r border-border p-4 overflow-y-auto">
        <Input
          placeholder="Filter fragments…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fragments match.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filtered.map((fragment) => (
              <li
                key={fragment.uuid}
                className={[
                  "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm",
                  activeFragmentId === fragment.uuid
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted",
                  fragment.isDiscarded ? "opacity-60" : "",
                ]
                  .join(" ")
                  .trim()}
              >
                <Link
                  to="/projects/$projectId/fragments/$fragmentId"
                  params={{ projectId, fragmentId: fragment.uuid }}
                  className="flex-1 min-w-0 truncate"
                >
                  <span className={fragment.isDiscarded ? "line-through" : undefined}>
                    {fragment.title}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {Math.round(fragment.readyStatus * 100)}%
                  </span>
                </Link>
                {fragment.isDiscarded ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      restoreFragment(
                        { projectId, fragmentId: fragment.uuid },
                        { onSuccess: invalidateList },
                      )
                    }
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      discardFragment(
                        { projectId, fragmentId: fragment.uuid },
                        { onSuccess: invalidateList },
                      )
                    }
                  >
                    Discard
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="flex-1 min-h-0 overflow-auto p-6">
        {activeFragmentId ? (
          <Outlet />
        ) : (
          <p className="text-sm text-muted-foreground">Select a fragment to edit.</p>
        )}
      </main>
    </div>
  );
}
