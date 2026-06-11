import type { Cycle, FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { Heading } from "@components/heading";

type ProjectWarningsPanelProps = {
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  fragmentByUuid: Map<string, FragmentSummary>;
  onNavigateToSequence: (sequenceId: string) => void;
};

export const ProjectWarningsPanel = ({
  sequences,
  violations,
  cycles,
  fragmentByUuid,
  onNavigateToSequence,
}: ProjectWarningsPanelProps) => {
  const sequenceByUuid = new Map(sequences.map((s) => [s.uuid, s]));

  const violationsBySecondary = new Map<string, number>();
  for (const violation of violations) {
    violationsBySecondary.set(
      violation.secondaryUuid,
      (violationsBySecondary.get(violation.secondaryUuid) ?? 0) + 1,
    );
  }

  const hasConflicts = cycles.length > 0 || violations.length > 0;

  return (
    <div className="flex flex-col gap-4 p-3">
      <Heading level={4}>Project warnings</Heading>

      {!hasConflicts && <p className="text-xs text-muted-foreground">No constraint conflicts.</p>}

      {cycles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-foreground">Cycles</p>
          <ul className="flex flex-col gap-2">
            {cycles.map((cycle, index) => {
              const sequenceNames = cycle.sequenceUuids
                .map((uuid) => sequenceByUuid.get(uuid))
                .filter(Boolean) as Sequence[];
              const fragmentKeys = cycle.fragmentUuids
                .map((uuid) => fragmentByUuid.get(uuid)?.key ?? uuid)
                .join(", ");
              return (
                <li key={index} className="flex flex-col gap-0.5 text-xs text-red-600">
                  <span className="font-medium">
                    {sequenceNames.map((sequence, seqIndex) => (
                      <span key={sequence.uuid}>
                        {seqIndex > 0 && ", "}
                        <button
                          type="button"
                          onClick={() => onNavigateToSequence(sequence.uuid)}
                          className="underline hover:no-underline"
                        >
                          {sequence.name}
                        </button>
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground">Fragments: {fragmentKeys}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {violationsBySecondary.size > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-foreground">Violations</p>
          <ul className="flex flex-col gap-0.5">
            {[...violationsBySecondary.entries()]
              .sort(([aUuid], [bUuid]) => {
                const aName = sequenceByUuid.get(aUuid)?.name ?? aUuid;
                const bName = sequenceByUuid.get(bUuid)?.name ?? bUuid;
                return aName.localeCompare(bName);
              })
              .map(([sequenceId, count]) => {
                const sequence = sequenceByUuid.get(sequenceId);
                return (
                  <li key={sequenceId} className="text-xs flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateToSequence(sequenceId)}
                      className="text-amber-600 underline hover:no-underline text-left"
                    >
                      {sequence?.name ?? sequenceId}
                    </button>
                    <span className="text-muted-foreground tabular-nums shrink-0">{count}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
};
