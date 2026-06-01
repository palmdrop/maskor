import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useListSequences } from "@api/generated/sequences/sequences";
import { Label } from "@components/ui/label";

type Props = {
  projectId: string;
  fragmentId: string;
};

interface Membership {
  sequenceUuid: string;
  sequenceName: string;
  sectionName: string;
  isMain: boolean;
}

// Read-only sidebar stat: which sequences the fragment is placed in, and where.
// Mirrors the `isPlaced` derived property from the fragment model — a fragment
// is placed if it holds a position in at least one sequence.
export const FragmentSequenceMembership = ({ projectId, fragmentId }: Props) => {
  const { data: bundleEnvelope } = useListSequences(projectId);

  const memberships = useMemo<Membership[]>(() => {
    if (bundleEnvelope?.status !== 200) return [];
    const result: Membership[] = [];
    for (const sequence of bundleEnvelope.data.sequences) {
      const section = sequence.sections.find((candidate) =>
        candidate.fragments.some((position) => position.fragmentUuid === fragmentId),
      );
      if (section) {
        result.push({
          sequenceUuid: sequence.uuid,
          sequenceName: sequence.name,
          sectionName: section.name,
          isMain: sequence.isMain,
        });
      }
    }
    return result;
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
              <Link
                to="/projects/$projectId/overview"
                params={{ projectId }}
                search={{ sequence: membership.sequenceUuid }}
                className="flex items-baseline justify-between gap-2 rounded bg-muted px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">
                  {membership.sequenceName}
                  {membership.isMain && (
                    <span className="ml-1 text-xs text-muted-foreground">(main)</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {membership.sectionName || "Untitled"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
