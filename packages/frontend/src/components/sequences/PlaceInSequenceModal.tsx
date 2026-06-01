import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSequences,
  getListSequencesQueryKey,
  useCreateSection,
  useDeleteSection,
} from "@api/generated/sequences/sequences";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { useSequenceMutations } from "@lib/sequences/useSequenceMutations";
import { computeStepMoveTarget, type SectionFragments } from "@lib/sequences/stepMove";
import { TileContent } from "@pages/OverviewPage/components/TileContent";
import { Button } from "@components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

interface PlaceInSequenceModalProps {
  projectId: string;
  fragmentId: string;
  sequenceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Empty color map: the modal renders compact tiles with neutral aspect bars
// rather than recomputing the Overview's per-aspect palette. Keys absent from
// the map fall back to a neutral color inside AspectColorBar.
const NO_ASPECT_COLORS = new Map<string, string>();

// The ←/→/Backspace shortcuts must keep firing while focus rests on one of the
// action buttons — Radix's FocusScope moves focus to a child control on open,
// so we cannot require focus on the dialog container itself. Instead we suppress
// the shortcuts only when focus is on a text-entry surface, where Backspace and
// the arrows carry their own meaning. Covers native fields, ARIA text/combobox
// roles, and contentEditable, so a future editable child can't trigger a
// destructive unplace mid-keystroke.
const isTextEntryTarget = (element: HTMLElement): boolean => {
  if (element.isContentEditable) return true;

  const tagName = element.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;

  const role = element.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
};

export const PlaceInSequenceModal = ({
  projectId,
  fragmentId,
  sequenceId,
  open,
  onOpenChange,
}: PlaceInSequenceModalProps) => {
  const queryClient = useQueryClient();
  const listQueryKey = getListSequencesQueryKey(projectId);

  const { data: bundleEnvelope, isLoading: isBundleLoading } = useListSequences(projectId);
  const { data: summariesEnvelope } = useListFragmentSummaries(projectId);

  const sequence =
    bundleEnvelope?.status === 200
      ? bundleEnvelope.data.sequences.find((candidate) => candidate.uuid === sequenceId)
      : undefined;

  const allFragments = summariesEnvelope?.status === 200 ? summariesEnvelope.data : [];
  const fragmentByUuid = useMemo(
    () => new Map(allFragments.map((fragment) => [fragment.uuid, fragment])),
    [allFragments],
  );
  const activeFragment = fragmentByUuid.get(fragmentId);

  const sectionsData: SectionFragments[] = useMemo(() => {
    if (!sequence) return [];
    return sequence.sections.map((section) => ({
      uuid: section.uuid,
      fragmentUuids: [...section.fragments]
        .sort((a, b) => a.position - b.position)
        .map((fragment) => fragment.fragmentUuid),
    }));
  }, [sequence]);

  const sectionNameByUuid = useMemo(
    () => new Map((sequence?.sections ?? []).map((section) => [section.uuid, section.name])),
    [sequence],
  );

  const currentSectionUuid =
    sectionsData.find((section) => section.fragmentUuids.includes(fragmentId))?.uuid ?? null;
  const isPlaced = currentSectionUuid !== null;

  const mutations = useSequenceMutations(listQueryKey);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: listQueryKey });
  const createSection = useCreateSection({ mutation: { onSuccess: refresh } });
  const deleteSection = useDeleteSection({ mutation: { onSuccess: refresh } });

  // Target section for "Add". Defaults to the first section; reset whenever the
  // sequence's section set changes so we never point at a deleted section.
  const [addTargetSectionUuid, setAddTargetSectionUuid] = useState<string | null>(null);
  useEffect(() => {
    if (sectionsData.length === 0) {
      setAddTargetSectionUuid(null);
      return;
    }
    setAddTargetSectionUuid((previous) =>
      previous && sectionsData.some((section) => section.uuid === previous)
        ? previous
        : sectionsData[0]!.uuid,
    );
  }, [sectionsData]);

  const moveTargets = useMemo(
    () => ({
      prev: computeStepMoveTarget(sectionsData, fragmentId, "prev"),
      next: computeStepMoveTarget(sectionsData, fragmentId, "next"),
    }),
    [sectionsData, fragmentId],
  );

  const handleAdd = () => {
    const targetSectionUuid = addTargetSectionUuid ?? sectionsData[0]?.uuid;
    if (!targetSectionUuid) return;
    const targetSection = sectionsData.find((section) => section.uuid === targetSectionUuid);

    // Place uses a plain insertion index into the unchanged section (append at
    // its current end) — unlike move, there is no prior removal to account for.
    // See computeStepMoveTarget for the remove-then-insert move semantics.
    mutations.placeFragment.mutate({
      projectId,
      sequenceId,
      data: {
        fragmentUuid: fragmentId,
        sectionUuid: targetSectionUuid,
        position: targetSection?.fragmentUuids.length ?? 0,
      },
    });
  };

  const handleMove = (direction: "prev" | "next") => {
    const target = moveTargets[direction];
    if (!target) return;
    mutations.moveFragment.mutate({
      projectId,
      sequenceId,
      fragmentUuid: fragmentId,
      data: { sectionUuid: target.sectionUuid, position: target.position },
    });
  };

  const handleRemove = () => {
    if (!isPlaced) return;
    mutations.unplaceFragment.mutate({ projectId, sequenceId, fragmentUuid: fragmentId });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryTarget(event.target as HTMLElement)) return;
    if (!isPlaced) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      handleMove("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      handleMove("next");
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      handleRemove();
    }
  };

  const canDeleteSection = sectionsData.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl"
        onKeyDown={handleKeyDown}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      >
        <DialogHeader>
          <DialogTitle>
            Place {activeFragment ? `"${activeFragment.key}"` : "fragment"} in{" "}
            {sequence?.name ?? "sequence"}
          </DialogTitle>
          <DialogDescription>
            {isPlaced
              ? `In section "${sectionNameByUuid.get(currentSectionUuid) || "Untitled"}". Use ←/→ to move, Backspace to remove.`
              : "Not in this sequence yet."}
          </DialogDescription>
        </DialogHeader>

        {isBundleLoading ? (
          <p className="text-sm text-muted-foreground">Loading sequence…</p>
        ) : !sequence ? (
          <p className="text-sm text-muted-foreground">Sequence not found.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {sectionsData.map((section) => (
                <section key={section.uuid} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {sectionNameByUuid.get(section.uuid) || "Untitled"}{" "}
                      <span className="tabular-nums">({section.fragmentUuids.length})</span>
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={!canDeleteSection || deleteSection.isPending}
                      title={
                        canDeleteSection ? undefined : "A sequence must keep at least one section"
                      }
                      onClick={() =>
                        deleteSection.mutate({ projectId, sequenceId, sectionId: section.uuid })
                      }
                    >
                      Delete section
                    </Button>
                  </div>
                  <div className="flex flex-row flex-wrap gap-2 rounded-md border border-dashed border-border/50 p-2 min-h-16">
                    {section.fragmentUuids.length === 0 ? (
                      <p className="text-xs text-muted-foreground self-center">Empty</p>
                    ) : (
                      section.fragmentUuids.map((uuid) => {
                        const fragment = fragmentByUuid.get(uuid);
                        if (!fragment) return null;
                        return (
                          <TileContent
                            key={uuid}
                            fragment={fragment}
                            density="compact"
                            colorByAspectKey={NO_ASPECT_COLORS}
                            isSelected={uuid === fragmentId}
                            draggable={false}
                          />
                        );
                      })
                    )}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={createSection.isPending}
                onClick={() => createSection.mutate({ projectId, sequenceId, data: { name: "" } })}
              >
                Add section
              </Button>

              {isPlaced ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!moveTargets.prev}
                    onClick={() => handleMove("prev")}
                  >
                    Move left
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!moveTargets.next}
                    onClick={() => handleMove("next")}
                  >
                    Move right
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={handleRemove}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {sectionsData.length > 1 && (
                    <Select
                      value={addTargetSectionUuid ?? undefined}
                      onValueChange={setAddTargetSectionUuid}
                    >
                      <SelectTrigger size="sm" className="w-44">
                        <SelectValue placeholder="Choose section" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectionsData.map((section) => (
                          <SelectItem key={section.uuid} value={section.uuid}>
                            {sectionNameByUuid.get(section.uuid) || "Untitled"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    disabled={mutations.placeFragment.isPending || !activeFragment}
                    onClick={handleAdd}
                  >
                    Add to sequence
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
