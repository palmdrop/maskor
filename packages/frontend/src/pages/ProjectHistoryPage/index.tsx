import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getActionLogQueryOptions } from "@api/action-log";
import { useListFragments } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { Switch } from "@components/ui/switch";
import { Label } from "@components/ui/label";
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
  // Action log prefetched by the route loader; a failed load surfaces via the
  // route error boundary (ViewError + Retry). The entity lists below stay classic
  // (secondary existence maps) and are also prefetched by the loader.
  const { data: envelope } = useSuspenseQuery(getActionLogQueryOptions(projectId, 100));
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

  // Non-200 throws under suspense (caught by the boundary); this narrows the union.
  if (envelope.status !== 200) return null;

  const entries = showErrors
    ? envelope.data
    : envelope.data.filter((entry) => entry.type !== "command:error");

  return (
    <div className="p-6 flex flex-col gap-4 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Actions
          </h2>
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
