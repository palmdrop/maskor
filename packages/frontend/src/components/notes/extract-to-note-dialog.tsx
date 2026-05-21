import { useMemo, useCallback } from "react";
import { useListNotes, useExtractNote } from "@api/generated/notes/notes";
import { ExtractToEntityDialogCore } from "@components/extract-to-entity-dialog-core";

type Props = {
  open: boolean;
  projectId: string;
  sourceUuid: string;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  selectionText: string;
  onClose: () => void;
  onSuccess: (newNoteUuid: string) => void;
};

export const ExtractToNoteDialog = ({
  open,
  projectId,
  sourceUuid,
  sourceType,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const { data: notesEnvelope } = useListNotes(projectId);
  const { mutateAsync: extractNote, isPending } = useExtractNote();

  const notes = useMemo(
    () => (notesEnvelope?.status === 200 ? notesEnvelope.data : []),
    [notesEnvelope],
  );

  const allKeys = useMemo(() => {
    const all = new Set<string>();
    for (const note of notes) all.add(note.key);
    return all;
  }, [notes]);

  const handleConfirm = useCallback(
    async (key: string): Promise<string | null> => {
      try {
        const result = await extractNote({
          projectId,
          data: {
            key,
            content: selectionText,
            sourceUuid,
            sourceType,
            sourceMode: "keep",
            navigated: true,
          },
        });
        if (result.status === 201) {
          onSuccess(result.data.uuid);
          return null;
        }
        return (result.data as { message?: string }).message ?? "Extraction failed. Try again.";
      } catch {
        return "Extraction failed. Try again.";
      }
    },
    [extractNote, projectId, selectionText, sourceUuid, sourceType, onSuccess],
  );

  return (
    <ExtractToEntityDialogCore
      open={open}
      title="Extract to note"
      selectionText={selectionText}
      preFillPrefix="unnamed-note"
      allKeys={allKeys}
      discardedKeys={new Set()}
      targetType="note"
      isPending={isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};
