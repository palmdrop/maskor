import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useActionLog } from "../../api/action-log";
import { useListFragments } from "../../api/generated/fragments/fragments";
import { useListAspects } from "../../api/generated/aspects/aspects";
import { useListNotes } from "../../api/generated/notes/notes";
import { useListReferences } from "../../api/generated/references/references";
import { ActionLogList, type ExistenceMaps } from "./ActionLogList";

const buildExistenceSet = <T extends { status: number; data: unknown } | undefined>(
  envelope: T,
): ReadonlySet<string> => {
  if (!envelope || envelope.status !== 200) return new Set();
  const data = envelope.data as Array<{ uuid: string }>;
  return new Set(data.map((entity) => entity.uuid));
};

export const ProjectHistoryPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/history" });
  const { data: envelope, isLoading, isError } = useActionLog(projectId, 100);
  const { data: fragments } = useListFragments(projectId);
  const { data: aspects } = useListAspects(projectId);
  const { data: notes } = useListNotes(projectId);
  const { data: references } = useListReferences(projectId);

  const existence: ExistenceMaps = useMemo(
    () => ({
      fragment: buildExistenceSet(fragments),
      aspect: buildExistenceSet(aspects),
      note: buildExistenceSet(notes),
      reference: buildExistenceSet(references),
    }),
    [fragments, aspects, notes, references],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading history…
      </div>
    );
  }

  if (isError || envelope?.status !== 200) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load history.
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Actions
        </h2>
        <p className="text-xs text-muted-foreground">
          Actions taken through Maskor. External vault edits are not tracked.
        </p>
      </div>
      <ActionLogList projectId={projectId} entries={envelope.data} existence={existence} />
    </div>
  );
};
