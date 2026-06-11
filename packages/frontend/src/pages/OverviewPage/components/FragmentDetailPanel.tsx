import type { FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { Heading } from "@components/heading";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
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

type FragmentDetailPanelProps = {
  fragment: FragmentSummary;
  sequences: Sequence[];
  violations: Violation[];
  fragmentByUuid: Map<string, FragmentSummary>;
  projectId: string;
  selectedContent?: string;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
  onRemoveFragment?: (fragmentUuid: string) => void;
  onOpen: () => void;
};

export const FragmentDetailPanel = ({
  fragment,
  sequences,
  violations,
  fragmentByUuid,
  projectId,
  selectedContent,
  onSaveContent,
  onRemoveFragment,
  onOpen,
}: FragmentDetailPanelProps) => {
  const membership = buildMembership(fragment.uuid, sequences);
  const placedInMain = isInMain(fragment.uuid, sequences);
  const fragmentViolations = placedInMain
    ? violations.filter((v) => v.fragmentUuid === fragment.uuid)
    : [];

  const isDiscarded = fragment.isDiscarded;

  return (
    <div className="flex flex-col gap-4 p-3">
      {onSaveContent && selectedContent !== undefined ? (
        // In-context editing of the same fragment shown in the spine.
        <FragmentProse
          projectId={projectId}
          fragmentUuid={fragment.uuid}
          title={fragment.key}
          content={selectedContent}
          isDiscarded={isDiscarded}
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

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          onClick={onOpen}
          className="self-start text-muted-foreground"
        >
          Open fragment
        </Button>
        {onRemoveFragment && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onRemoveFragment(fragment.uuid)}
            className="self-start text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            Remove from sequence
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Heading level={4}>Placements</Heading>
        {membership.length === 0 ? (
          <p className="text-xs text-muted-foreground">Not placed in any sequence.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {membership.map((entry, index) => (
              <li key={index} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{entry.sequenceName}</span>
                {entry.isMain && (
                  <Badge variant="outline" className="ml-1">
                    main
                  </Badge>
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
          <Heading level={4}>Violations</Heading>
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
