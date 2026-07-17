import { useMemo } from "react";
import { useListSequences } from "@api/generated/sequences/sequences";
import { Label } from "@components/ui/label";

type Props = {
  projectId: string;
  fragmentId: string;
  // Opens the "Place in sequence" modal for the clicked sequence — quicker than
  // a round-trip through the Overview (which the modal itself links to).
  onOpenSequence: (sequenceUuid: string) => void;
};

interface Membership {
  sequenceUuid: string;
  sequenceName: string;
  sectionName: string;
  isMain: boolean;
  fragmentIndex: number;
  fragmentCount: number;
}

// Rough position cue: a tick on a small track, left = first, right = last.
// Not proportional to fragment length — index-based only.
const SequencePositionIndicator = ({
  fragmentIndex,
  fragmentCount,
}: Pick<Membership, "fragmentIndex" | "fragmentCount">) => {
  const relativePosition = fragmentCount > 1 ? fragmentIndex / (fragmentCount - 1) : 0.5;
  const percent = relativePosition * 100;
  return (
    <span
      className="relative h-3 w-8 shrink-0 self-center rounded-sm bg-muted-foreground/15"
      title={`Position ${fragmentIndex + 1} of ${fragmentCount}`}
      role="img"
      aria-label={`Position ${fragmentIndex + 1} of ${fragmentCount}`}
    >
      <span
        className="absolute inset-y-0 w-0.5 rounded-full bg-muted-foreground"
        style={{ left: `${percent}%`, transform: `translateX(-${percent}%)` }}
      />
    </span>
  );
};

// Read-only sidebar stat: which sequences the fragment is placed in, and where.
// Mirrors the `isPlaced` derived property from the fragment model — a fragment
// is placed if it holds a position in at least one sequence.
export const FragmentSequenceMembership = ({ projectId, fragmentId, onOpenSequence }: Props) => {
  const { data: bundleEnvelope } = useListSequences(projectId);

  const memberships = useMemo<Membership[]>(() => {
    if (bundleEnvelope?.status !== 200) return [];
    return bundleEnvelope.data.sequences.flatMap((sequence) => {
      const section = sequence.sections.find((candidate) =>
        candidate.fragments.some((position) => position.fragmentUuid === fragmentId),
      );
      if (!section) return [];
      const orderedFragmentUuids = sequence.sections.flatMap((candidate) =>
        [...candidate.fragments]
          .sort((a, b) => a.position - b.position)
          .map((position) => position.fragmentUuid),
      );
      return [
        {
          sequenceUuid: sequence.uuid,
          sequenceName: sequence.name,
          sectionName: section.name,
          isMain: sequence.isMain,
          fragmentIndex: orderedFragmentUuids.indexOf(fragmentId),
          fragmentCount: orderedFragmentUuids.length,
        },
      ];
    });
  }, [bundleEnvelope, fragmentId]);

  return (
    <div className="flex flex-col gap-2">
      <Label>Sequences</Label>
      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not placed in any sequence.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {memberships.map((membership) => (
            <li key={membership.sequenceUuid}>
              <button
                type="button"
                onClick={() => onOpenSequence(membership.sequenceUuid)}
                className="flex w-full items-baseline justify-between gap-2 rounded bg-muted px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">
                  {membership.sequenceName}
                  {membership.isMain && (
                    <span className="ml-1 text-xs text-muted-foreground">(main)</span>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">
                    {membership.sectionName || "Untitled"}
                  </span>
                  <SequencePositionIndicator
                    fragmentIndex={membership.fragmentIndex}
                    fragmentCount={membership.fragmentCount}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
