import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useListDrafts } from "@api/generated/drafts/drafts";
import { Button } from "@components/ui/button";
import { CreateDraftDialog } from "./CreateDraftDialog";
import { DeleteDraftDialog } from "./DeleteDraftDialog";
import { RestoreDraftDialog } from "./RestoreDraftDialog";

type DraftEntityCounts = {
  fragments: number;
  aspects: number;
  notes: number;
  references: number;
  sequences: number;
};

type Draft = {
  uuid: string;
  name: string;
  note?: string;
  createdAt: string;
  entityCounts: DraftEntityCounts;
};

const formatCounts = (counts: DraftEntityCounts): string => {
  const parts: string[] = [];
  if (counts.fragments > 0)
    parts.push(`${counts.fragments} fragment${counts.fragments === 1 ? "" : "s"}`);
  if (counts.aspects > 0) parts.push(`${counts.aspects} aspect${counts.aspects === 1 ? "" : "s"}`);
  if (counts.notes > 0) parts.push(`${counts.notes} note${counts.notes === 1 ? "" : "s"}`);
  if (counts.references > 0)
    parts.push(`${counts.references} reference${counts.references === 1 ? "" : "s"}`);
  if (counts.sequences > 0)
    parts.push(`${counts.sequences} sequence${counts.sequences === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "empty";
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

export const DraftsPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/drafts" });
  const { data: envelope, isLoading, isError } = useListDrafts(projectId);

  const drafts: Draft[] = useMemo(() => {
    if (envelope?.status !== 200) return [];
    return envelope.data as Draft[];
  }, [envelope]);

  const [createOpen, setCreateOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Draft | null>(null);

  const defaultName = `Draft ${drafts.length + 1}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading drafts…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load drafts.
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Drafts
          </h2>
          <p className="text-xs text-muted-foreground">
            Snapshots of the project at a moment in time. Restore any draft to roll the project
            back.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create draft</Button>
      </div>

      {drafts.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No drafts yet. Create one to snapshot the current state.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li
              key={draft.uuid}
              className="flex items-start justify-between gap-4 rounded border border-border p-3"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium truncate">{draft.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(draft.createdAt)}
                  </span>
                </div>
                {draft.note && (
                  <p className="text-xs text-muted-foreground truncate">{draft.note}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatCounts(draft.entityCounts)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setRestoreTarget(draft)}>
                  Restore
                </Button>
                <Button variant="ghost" onClick={() => setDeleteTarget(draft)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateDraftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        defaultName={defaultName}
      />

      {restoreTarget && (
        <RestoreDraftDialog
          open={!!restoreTarget}
          onOpenChange={(next) => {
            if (!next) setRestoreTarget(null);
          }}
          projectId={projectId}
          draftId={restoreTarget.uuid}
          draftName={restoreTarget.name}
        />
      )}

      {deleteTarget && (
        <DeleteDraftDialog
          open={!!deleteTarget}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          projectId={projectId}
          draftId={deleteTarget.uuid}
          draftName={deleteTarget.name}
        />
      )}
    </div>
  );
};
