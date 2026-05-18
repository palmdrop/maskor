import { useNavigate, useParams } from "@tanstack/react-router";
import type { FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";

type MembershipEntry = {
  sequenceName: string;
  sectionName: string;
  position: number;
  isMain: boolean;
};

function buildMembership(fragmentUuid: string, sequences: Sequence[]): MembershipEntry[] {
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
}

function isInMain(fragmentUuid: string, sequences: Sequence[]): boolean {
  const main = sequences.find((s) => s.isMain);
  if (!main) return false;
  return main.sections.some((sec) => sec.fragments.some((f) => f.fragmentUuid === fragmentUuid));
}

type Props = {
  fragment: FragmentSummary | undefined;
  sequences: Sequence[];
  violations: Violation[];
  fragmentByUuid: Map<string, FragmentSummary>;
};

export const RightSidebar = ({ fragment, sequences, violations, fragmentByUuid }: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();

  return (
    <aside className="flex flex-col w-64 shrink-0 border-l border-border overflow-y-auto">
      {fragment ? (
        <FragmentDetail
          fragment={fragment}
          sequences={sequences}
          violations={violations}
          fragmentByUuid={fragmentByUuid}
          projectId={projectId}
          onOpen={() =>
            void navigate({
              to: "/projects/$projectId/fragments/$fragmentId",
              params: { projectId, fragmentId: fragment.uuid },
            })
          }
        />
      ) : (
        <EmptyState />
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
  onOpen: () => void;
};

const FragmentDetail = ({
  fragment,
  sequences,
  violations,
  fragmentByUuid,
  onOpen,
}: FragmentDetailProps) => {
  const membership = buildMembership(fragment.uuid, sequences);
  const placedInMain = isInMain(fragment.uuid, sequences);
  const fragmentViolations = placedInMain
    ? violations.filter((v) => v.fragmentUuid === fragment.uuid)
    : [];

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-foreground">{fragment.key}</span>
        {fragment.excerpt && (
          <span className="text-xs text-muted-foreground leading-snug">{fragment.excerpt}</span>
        )}
      </div>

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

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full p-4 text-center">
    <p className="text-xs text-muted-foreground">Select a fragment to see details.</p>
  </div>
);
