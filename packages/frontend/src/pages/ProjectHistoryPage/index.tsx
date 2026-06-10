import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useActionLog } from "@api/action-log";
import { useListFragments } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { Switch } from "@components/ui/switch";
import { Label } from "@components/ui/label";
import { ActionLogList, type ExistenceMaps } from "./ActionLogList";
import { Heading } from "@components/heading";

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
  const [showErrors, setShowErrors] = useState(true);

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

  const entries = showErrors
    ? envelope.data
    : envelope.data.filter((entry) => entry.type !== "command:error");

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Heading level={3}>Recent Actions</Heading>
          <p className="text-xs text-muted-foreground">
            Actions taken through Maskor. External vault edits are not tracked.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="show-errors" checked={showErrors} onCheckedChange={setShowErrors} />
          <Label htmlFor="show-errors" className="text-xs text-muted-foreground">
            Show errors
          </Label>
        </div>
      </div>
      <ActionLogList projectId={projectId} entries={entries} existence={existence} />
    </div>
  );
};
