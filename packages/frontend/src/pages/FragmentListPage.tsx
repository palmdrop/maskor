import { useRef, useState, useCallback } from "react";
import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFragments,
  useDiscardFragment,
  useRestoreFragment,
  useCreateFragment,
  useDeleteFragment,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import { Input } from "@components/ui/input";
import { Button } from "@components/ui/button";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { CreateEntityDialog } from "@components/create-entity-dialog";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { UploadIcon } from "lucide-react";

export const FragmentListPage = () => {
  const from = "/projects/$projectId/fragments" as const;
  const { projectId } = useParams({ from });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const { data: envelope, isLoading, isError } = useListFragments(projectId);
  const { mutate: discardFragment } = useDiscardFragment();
  const { mutate: restoreFragment } = useRestoreFragment();
  const { mutate: deleteFragment } = useDeleteFragment();
  const createFragment = useCreateFragment();

  const [filter, setFilter] = useState("");
  const [showDiscarded, , toggleShowDiscarded] = usePersistedBoolean(
    "fragmentListPage_showDiscarded",
    false,
  );

  const location = useRouterState({ select: (s) => s.location.pathname });
  const fragmentIdMatch = location.match(/\/projects\/[^/]+\/fragments\/([^/]+)/);
  const activeFragmentId = fragmentIdMatch ? fragmentIdMatch[1] : null;

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) }),
    [queryClient, projectId],
  );

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (importFileInputRef.current) importFileInputRef.current.value = "";
    void navigate({
      to: "/projects/$projectId/fragments/import",
      params: { projectId },
      state: { file: selectedFile },
    });
  };

  const handleCreateFragment = async (key: string, content: string) => {
    const response = await createFragment.mutateAsync({
      projectId,
      data: { key, content },
    });
    await invalidateList();
    if (response.status === 201) {
      navigate({
        to: "/projects/$projectId/fragments/$fragmentId",
        params: { projectId, fragmentId: response.data.uuid },
      });
    }
  };

  if (isLoading) return <p>Loading fragments…</p>;
  if (isError || !envelope) return <p>Failed to load fragments.</p>;

  const fragments = envelope.status === 200 ? envelope.data : [];
  const discardedCount = fragments.reduce((count, f) => count + (f.isDiscarded ? 1 : 0), 0);
  const visible = showDiscarded ? fragments : fragments.filter((f) => !f.isDiscarded);
  const filtered = filter
    ? visible.filter((f) => f.key.toLowerCase().includes(filter.toLowerCase()))
    : visible;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col gap-3 w-72 shrink-0 border-r border-border p-4 overflow-y-auto">
        <div className="flex gap-2">
          <CreateEntityDialog
            triggerLabel="New fragment"
            dialogTitle="New fragment"
            entityName="fragment"
            contentRequired
            isPending={createFragment.isPending}
            onCreate={handleCreateFragment}
          />
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => importFileInputRef.current?.click()}
          >
            <UploadIcon />
            Import
          </Button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".md,.txt,.docx"
            className="hidden"
            onChange={handleImportFileChange}
          />
        </div>
        <Input
          placeholder="Filter fragments…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-discarded" className="text-xs text-muted-foreground">
            Show discarded
            {discardedCount > 0 && (
              <span className="ml-1 text-muted-foreground/70">({discardedCount})</span>
            )}
          </Label>
          <Switch
            id="show-discarded"
            checked={showDiscarded}
            onCheckedChange={toggleShowDiscarded}
          />
        </div>
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
                    {fragment.key}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {Math.round(fragment.readyStatus * 100)}%
                  </span>
                </Link>
                {fragment.isDiscarded ? (
                  <>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => {
                        if (
                          confirm(
                            `Permanently delete fragment "${fragment.key}"? This removes the file from the vault and cannot be undone.`,
                          )
                        ) {
                          deleteFragment(
                            { projectId, fragmentId: fragment.uuid },
                            { onSuccess: invalidateList },
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </>
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
      <main className="flex-1 min-h-0 overflow-auto p-4">
        {activeFragmentId ? (
          <Outlet />
        ) : (
          <p className="text-sm text-muted-foreground">Select a fragment to edit.</p>
        )}
      </main>
    </div>
  );
};
