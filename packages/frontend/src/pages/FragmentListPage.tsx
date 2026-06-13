import { useRef, useState, useCallback, useMemo } from "react";
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
import { useListSequences } from "@api/generated/sequences/sequences";
import { Input } from "@components/ui/input";
import { Button } from "@components/ui/button";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";
import { CreateEntityDialog } from "@components/create-entity-dialog";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { usePersistedString } from "@hooks/usePersistedString";
import {
  buildSequenceOrder,
  encodeSortMode,
  parseSortMode,
  sortFragments,
} from "@lib/fragments/sort";
import { useRebuildStatus } from "@contexts/RebuildStatusContext";
import { FragmentListOrderProvider } from "@contexts/FragmentListOrderContext";
import { UploadIcon } from "lucide-react";

export const FragmentListPage = () => {
  const from = "/projects/$projectId/fragments" as const;
  const { projectId } = useParams({ from });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const { data: envelope, isLoading, isError } = useListFragments(projectId);
  const { data: sequencesEnvelope } = useListSequences(projectId);
  const { isRebuilding } = useRebuildStatus();
  const { mutate: discardFragment } = useDiscardFragment();
  const { mutate: restoreFragment } = useRestoreFragment();
  const { mutate: deleteFragment } = useDeleteFragment();
  const createFragment = useCreateFragment();

  const [filter, setFilter] = useState("");
  const [showDiscarded, , toggleShowDiscarded] = usePersistedBoolean(
    "fragmentListPage_showDiscarded",
    false,
  );
  const [sortValue, setSortValue] = usePersistedString("fragmentListPage_sort", "name");

  const sequences = useMemo(
    () => (sequencesEnvelope?.status === 200 ? sequencesEnvelope.data.sequences : []),
    [sequencesEnvelope],
  );

  // Resolve the persisted sort against the sequences that actually exist; a
  // stored "sequence:<uuid>" for a deleted sequence falls back to name order.
  const sortMode = useMemo(() => {
    const parsed = parseSortMode(sortValue);
    if (parsed.kind === "sequence" && !sequences.some((s) => s.uuid === parsed.sequenceUuid)) {
      return { kind: "name" as const };
    }
    return parsed;
  }, [sortValue, sequences]);

  const sequenceOrder = useMemo(() => {
    if (sortMode.kind !== "sequence") return undefined;
    const sequence = sequences.find((s) => s.uuid === sortMode.sequenceUuid);
    return sequence ? buildSequenceOrder(sequence) : undefined;
  }, [sortMode, sequences]);

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
      // TanStack Router's HistoryState type is strict by default; the import
      // page reads this via `useRouterState` and casts to its own RouterState
      // shape, so we mirror that cast here. Proper fix would be declaration-
      // merging HistoryState globally with TanStack's module-augmentation API.
      state: { file: selectedFile } as never,
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

  if (isLoading && isRebuilding)
    return <p className="p-4 text-sm text-muted-foreground">Rebuilding project index…</p>;
  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading fragments…</p>;
  if (isError || !envelope)
    return <p className="p-4 text-sm text-muted-foreground">Failed to load fragments.</p>;

  const fragments = envelope.status === 200 ? envelope.data : [];
  const discardedCount = fragments.reduce((count, f) => count + (f.isDiscarded ? 1 : 0), 0);
  const visible = showDiscarded ? fragments : fragments.filter((f) => !f.isDiscarded);
  const filtered = filter
    ? visible.filter((f) => f.key.toLowerCase().includes(filter.toLowerCase()))
    : visible;
  const sorted = sortFragments(filtered, sortMode, sequenceOrder);

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
          <Label htmlFor="fragment-sort" className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select value={encodeSortMode(sortMode)} onValueChange={setSortValue}>
            <SelectTrigger id="fragment-sort" size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="updatedAt">Updated at</SelectItem>
              </SelectGroup>
              {sequences.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>By sequence</SelectLabel>
                    {sequences.map((sequence) => (
                      <SelectItem
                        key={sequence.uuid}
                        value={encodeSortMode({
                          kind: "sequence",
                          sequenceUuid: sequence.uuid,
                        })}
                      >
                        {sequence.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
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
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fragments match.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((fragment) => (
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
                    {Math.round(fragment.readiness * 100)}%
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
          // Expose the displayed order (filtered + sorted) so the editor's
          // Previous/Next walks exactly what this list currently shows.
          <FragmentListOrderProvider orderedFragmentUuids={sorted.map((f) => f.uuid)}>
            <Outlet />
          </FragmentListOrderProvider>
        ) : (
          <p className="text-sm text-muted-foreground">Select a fragment to edit.</p>
        )}
      </main>
    </div>
  );
};
