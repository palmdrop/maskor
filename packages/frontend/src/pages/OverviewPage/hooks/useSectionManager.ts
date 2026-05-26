import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSection,
  useRenameSection,
  useDeleteSection,
} from "@api/generated/sequences/sequences";
import type { Sequence } from "@api/generated/maskorAPI.schemas";

interface UseSectionManagerParams {
  projectId: string;
  sequence: Sequence | undefined;
  listQueryKey: readonly unknown[];
}

export const useSectionManager = ({ projectId, sequence, listQueryKey }: UseSectionManagerParams) => {
  const queryClient = useQueryClient();
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState<string>("");
  const [confirmingDeleteSectionId, setConfirmingDeleteSectionId] = useState<string | null>(null);

  const refreshActiveSequence = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey });
  }, [queryClient, listQueryKey]);

  const createSection = useCreateSection({
    mutation: {
      onSuccess: (data) => {
        if (data.status !== 200) return;
        const updatedSeq = data.data.sequences.find((s) => s.uuid === sequence?.uuid);
        const newSection = updatedSeq?.sections[updatedSeq.sections.length - 1];
        if (newSection) {
          setEditingSectionId(newSection.uuid);
          setEditingSectionValue("");
        }
        refreshActiveSequence();
      },
    },
  });

  const renameSection = useRenameSection({
    mutation: {
      onSuccess: () => refreshActiveSequence(),
    },
  });

  const deleteSection = useDeleteSection({
    mutation: {
      onSuccess: () => {
        setConfirmingDeleteSectionId(null);
        refreshActiveSequence();
      },
    },
  });

  const handleSectionRenameCommit = (sectionId: string, newName: string) => {
    if (!sequence) return;
    renameSection.mutate({
      projectId,
      sequenceId: sequence.uuid,
      sectionId,
      data: { name: newName },
    });
    setEditingSectionId(null);
  };

  const handleSectionRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    sectionId: string,
    originalName: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSectionRenameCommit(sectionId, editingSectionValue);
    } else if (e.key === "Escape") {
      setEditingSectionId(null);
      setEditingSectionValue(originalName);
    }
  };

  return {
    editingSectionId,
    setEditingSectionId,
    editingSectionValue,
    setEditingSectionValue,
    confirmingDeleteSectionId,
    setConfirmingDeleteSectionId,
    createSection,
    renameSection,
    deleteSection,
    handleSectionRenameCommit,
    handleSectionRenameKeyDown,
  };
};
