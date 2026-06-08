import { useNavigate, useParams } from "@tanstack/react-router";
import type { Cycle, FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { FragmentProse } from "./FragmentProse";

type MembershipEntry = {
  sequenceName: string;
  sectionName: string;
  position: number;
  isMain: boolean;
};

const buildMembership = (fragmentUuid: string, sequences: Sequence[]): MembershipEntry[] => {
  const entries: MembershipEntry[] = [];
  for (const sequence of sequences) {
    for (const section of sequence.sections) {
      const placed = section.fragments.find((f) => f.fragmentUuid === fragmentUuid);
      if (placed) {
        entries.push({
          sequenceName: sequence.name,
          sectionName: section.name || "Untitled section",
          position: placed.position,
          isMain: sequence.isMain,
        });
      }
    }
  }
  return entries.sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.sequenceName.localeCompare(b.sequenceName);
  });
};

const isInMain = (fragmentUuid: string, sequences: Sequence[]): boolean => {
  const main = sequences.find((s) => s.isMain);
  if (!main) return false;
  return main.sections.some((sec) => sec.fragments.some((f) => f.fragmentUuid === fragmentUuid));
};

type Props = {
  fragment: FragmentSummary | undefined;
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  fragmentByUuid: Map<string, FragmentSummary>;
  // Full markdown body of the selected fragment (from the bulk-content endpoint),
  // enabling in-context editing of the same fragment shown in the spine.
  selectedContent?: string;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
};

export const RightSidebar = ({
  fragment,
  sequences,
  violations,
  cycles,
  fragmentByUuid,
  selectedContent,
  onSaveContent,
}: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();

  const handleNavigateToSequence = (sequenceId: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      // Preserve the current detail level if one is in the URL; leave it
      // undefined otherwise so the persisted per-project preference resolves.
      // Narrow `prev` to only the keys the target route expects.
      search: (prev) => ({ detail: prev.detail, sequence: sequenceId }),
    });
  };

  return (
    <aside className="flex flex-col w-64 shrink-0 border-l border-border overflow-y-auto">
      {fragment ? (
        <FragmentDetail
          fragment={fragment}
          sequences={sequences}
          violations={violations}
          fragmentByUuid={fragmentByUuid}
          projectId={projectId}
          selectedContent={selectedContent}
          onSaveContent={onSaveContent}
          onOpen={() =>
            void navigate({
              to: "/projects/$projectId/fragments/$fragmentId",
              params: { projectId, fragmentId: fragment.uuid },
            })
          }
        />
      ) : (
        <ProjectWarningsPanel
          sequences={sequences}
          violations={violations}
          cycles={cycles}
          fragmentByUuid={fragmentByUuid}
          onNavigateToSequence={handleNavigateToSequence}
        />
      )}
    </aside>
  );
};

type FragmentDetailProps = {
  fragment: FragmentSummary;
  sequences: Sequence[];
  violations: Violation[];
  fragmentByUuid: Map<string, FragmentSummary>;
  projectId: string;
  selectedContent?: string;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
  onOpen: () => void;
};

const FragmentDetail = ({
  fragment,
  sequences,
  violations,
  fragmentByUuid,
  selectedContent,
  onSaveContent,
  onOpen,
}: FragmentDetailProps) => {
  const membership = buildMembership(fragment.uuid, sequences);
  const placedInMain = isInMain(fragment.uuid, sequences);
  const fragmentViolations = placedInMain
    ? violations.filter((v) => v.fragmentUuid === fragment.uuid)
    : [];

  return (
    <div className="flex flex-col gap-4 p-3">
      {onSaveContent && selectedContent !== undefined ? (
        // In-context editing of the same fragment shown in the spine.
        <FragmentProse
          projectId={projectId}
          fragmentUuid={fragment.uuid}
          title={fragment.key}
          content={selectedContent}
          detailLevel="prose"
          excerpt={fragment.excerpt ?? undefined}
          onSaveContent={onSaveContent}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-foreground">{fragment.key}</span>
          {fragment.excerpt && (
            <span className="text-xs text-muted-foreground leading-snug">{fragment.excerpt}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="text-xs text-left px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors self-start"
      >
        Open fragment
      </button>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Placements
        </p>
        {membership.length === 0 ? (
          <p className="text-xs text-muted-foreground">Not placed in any sequence.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {membership.map((entry, index) => (
              <li key={index} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{entry.sequenceName}</span>
                {entry.isMain && (
                  <span className="ml-1 text-xs px-1 rounded border border-border">main</span>
                )}
                <br />
                <span className="pl-2">
                  {entry.sectionName}, position {entry.position}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {fragmentViolations.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Violations
          </p>
          <ul className="flex flex-col gap-0.5">
            {fragmentViolations.map((violation, index) => {
              const predecessor = fragmentByUuid.get(violation.predecessorUuid);
              const secondary = sequences.find((s) => s.uuid === violation.secondaryUuid);
              return (
                <li key={index} className="text-xs text-amber-600">
                  Should appear after{" "}
                  <span className="font-medium">
                    {predecessor?.key ?? violation.predecessorUuid}
                  </span>{" "}
                  (from {secondary?.name ?? violation.secondaryUuid})
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

type ProjectWarningsPanelProps = {
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  fragmentByUuid: Map<string, FragmentSummary>;
  onNavigateToSequence: (sequenceId: string) => void;
};

const ProjectWarningsPanel = ({
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
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Project warnings
      </p>

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
