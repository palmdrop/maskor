import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useGetProjectStats } from "@api/generated/stats/stats";
import type { FragmentStatsSummary } from "@api/generated/maskorAPI.schemas";

const HISTOGRAM_LABELS = ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"] as const;

const HistogramBar = ({ count, max }: { count: number; max: number }) => {
  const heightPercent = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      <div className="w-full bg-muted rounded-sm overflow-hidden h-16 flex items-end">
        <div className="w-full bg-primary/60 rounded-sm" style={{ height: `${heightPercent}%` }} />
      </div>
    </div>
  );
};

const StatTile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-md border border-border p-4 flex flex-col gap-1">
    <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
    <span className="text-2xl font-semibold tabular-nums">{value}</span>
  </div>
);

const FragmentRow = ({
  fragment,
  projectId,
}: {
  fragment: FragmentStatsSummary;
  projectId: string;
}) => (
  <tr
    className={`border-b border-border last:border-0 transition-colors ${
      fragment.isDiscarded ? "opacity-50 hover:opacity-70" : "hover:bg-muted/30"
    }`}
  >
    <td className="py-2 pr-4">
      {fragment.isDiscarded ? (
        <span className="text-sm line-through text-muted-foreground">{fragment.key}</span>
      ) : (
        <Link
          to="/projects/$projectId/fragments/$fragmentId"
          params={{ projectId, fragmentId: fragment.fragmentUuid }}
          className="text-sm hover:underline"
        >
          {fragment.key}
        </Link>
      )}
    </td>
    <td className="py-2 pr-4 text-sm tabular-nums text-right">{fragment.wordCount}</td>
    <td className="py-2 pr-4 text-sm text-right text-muted-foreground">
      {new Date(fragment.updatedAt).toLocaleDateString()}
    </td>
    <td className="py-2 text-sm tabular-nums text-right">
      {Math.round(fragment.readiness * 100)}%
    </td>
  </tr>
);

export const ProjectStatsPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/stats" });
  const { data: envelope, isLoading } = useGetProjectStats(projectId);
  const [includeDiscarded, setIncludeDiscarded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading stats…
      </div>
    );
  }

  if (envelope?.status !== 200) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load stats.
      </div>
    );
  }

  const { global: globalStats, fragments } = envelope.data;

  const visibleFragments = includeDiscarded
    ? fragments
    : fragments.filter((fragment) => !fragment.isDiscarded);

  const histogramMax = Math.max(...globalStats.readinessHistogram, 1);

  return (
    <div className="p-6 flex flex-col gap-8 overflow-y-auto h-full">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Fragments" value={globalStats.totalCount} />
          <StatTile label="Discarded" value={globalStats.discardedCount} />
          <StatTile label="Ready" value={globalStats.readyCount} />
          <StatTile
            label="Avg ready"
            value={`${Math.round(globalStats.averageReadiness * 100)}%`}
          />
          <StatTile label="Total words" value={globalStats.totalWordCount.toLocaleString()} />
          <StatTile
            label="Avg words"
            value={Math.round(globalStats.averageWordCount).toLocaleString()}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ready status distribution
        </h2>
        <div className="flex gap-2 items-end">
          {globalStats.readinessHistogram.map((count, index) => (
            <div key={HISTOGRAM_LABELS[index]} className="flex flex-col items-center gap-1 flex-1">
              <HistogramBar count={count} max={histogramMax} />
              <span className="text-xs text-muted-foreground">{HISTOGRAM_LABELS[index]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Fragments
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDiscarded}
              onChange={(event) => setIncludeDiscarded(event.target.checked)}
              className="rounded"
            />
            Include discarded
          </label>
        </div>
        {visibleFragments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fragments yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Key
                </th>
                <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">
                  Words
                </th>
                <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">
                  Last edited
                </th>
                <th className="pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">
                  Ready
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleFragments.map((fragment) => (
                <FragmentRow
                  key={fragment.fragmentUuid}
                  fragment={fragment}
                  projectId={projectId}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
