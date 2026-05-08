import { useGetFragmentStats } from "../../api/generated/stats/stats";
import { Label } from "../ui/label";

type Props = {
  projectId: string;
  fragmentId: string;
};

const formatDate = (isoString: string | null): string => {
  if (!isoString) {
    return "Never";
  }
  return new Date(isoString).toLocaleDateString();
};

export const FragmentStatsInspector = ({ projectId, fragmentId }: Props) => {
  const { data: envelope } = useGetFragmentStats(projectId, fragmentId);

  const stats = envelope?.status === 200 ? envelope.data : null;

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium">Stats</Label>
      {stats ? (
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Words</span>
            <span className="tabular-nums">{stats.wordCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Edits</span>
            <span className="tabular-nums">{stats.editCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Voluntary opens</span>
            <span className="tabular-nums">{stats.voluntaryOpenCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Prompt accepts</span>
            <span className="tabular-nums">{stats.promptAcceptCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Avoidances</span>
            <span className="tabular-nums">{stats.avoidanceCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Last surfaced</span>
            <span>{formatDate(stats.lastSurfacedAt)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}
    </div>
  );
};
