import { useListSequences } from "@api/generated/sequences/sequences";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { SequenceArranger } from "@pages/OverviewPage/components/SequenceArranger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@components/ui/dialog";

interface PlaceInSequenceModalProps {
  projectId: string;
  fragmentId: string;
  sequenceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// A thin shell over the shared SequenceArranger: the user has already chosen a
// sequence (via the "Place in sequence…" picker), so the modal just resolves it
// and hands the active fragment to the arranger for drag/keyboard arrangement.
export const PlaceInSequenceModal = ({
  projectId,
  fragmentId,
  sequenceId,
  open,
  onOpenChange,
}: PlaceInSequenceModalProps) => {
  const { data: bundleEnvelope, isLoading: isBundleLoading } = useListSequences(projectId);
  const { data: summariesEnvelope } = useListFragmentSummaries(projectId);

  const sequence =
    bundleEnvelope?.status === 200
      ? bundleEnvelope.data.sequences.find((candidate) => candidate.uuid === sequenceId)
      : undefined;

  const allFragments = summariesEnvelope?.status === 200 ? summariesEnvelope.data : [];
  const activeFragment = allFragments.find((fragment) => fragment.uuid === fragmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      >
        <DialogHeader>
          <DialogTitle>
            Place {activeFragment ? `"${activeFragment.key}"` : "fragment"} in{" "}
            {sequence?.name ?? "sequence"}
          </DialogTitle>
          <DialogDescription>
            Drag to arrange, or use ←/→ to move and Backspace to remove the fragment.
          </DialogDescription>
        </DialogHeader>

        {isBundleLoading ? (
          <p className="text-sm text-muted-foreground">Loading sequence…</p>
        ) : !sequence ? (
          <p className="text-sm text-muted-foreground">Sequence not found.</p>
        ) : (
          <SequenceArranger
            projectId={projectId}
            sequence={sequence}
            allFragments={allFragments}
            activeFragmentUuid={fragmentId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
