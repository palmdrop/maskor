import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Cycle, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import {
  useCreateSequence,
  useUpdateSequence,
  useDeleteSequence,
  useCloneSequence,
  useInsertSequence,
  getListSequencesQueryKey,
  getGetSequenceContentsQueryKey,
} from "@api/generated/sequences/sequences";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { sequenceSidebarScope } from "@lib/commands/scopes/sequence-sidebar";
import { Heading } from "@components/heading";
import { ShuffleSequenceDialog } from "@components/sequences/ShuffleSequenceDialog";
import { SequenceRow } from "./SequenceRow";

type Props = {
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  activeSequenceId: string | undefined;
};

const sequenceStatus = (
  sequence: Sequence,
  violations: Violation[],
  cycles: Cycle[],
): "cycle" | "violation" | "ok" => {
  if (cycles.some((c) => c.sequenceUuids.includes(sequence.uuid))) return "cycle";
  if (violations.some((v) => v.secondaryUuid === sequence.uuid)) return "violation";
  return "ok";
};

const fragmentCount = (sequence: Sequence): number =>
  sequence.sections.reduce((total, section) => total + section.fragments.length, 0);

const generateDefaultName = (existingNames: Set<string>): string => {
  const base = "New sequence";
  if (!existingNames.has(base)) return base;
  let counter = 2;
  while (existingNames.has(`${base} ${counter}`)) {
    counter++;
  }
  return `${base} ${counter}`;
};

const generateCloneName = (baseName: string, existingNames: Set<string>): string => {
  const candidate = `${baseName} (copy)`;
  if (!existingNames.has(candidate)) return candidate;
  let counter = 2;
  while (existingNames.has(`${baseName} (copy ${counter})`)) {
    counter++;
  }
  return `${baseName} (copy ${counter})`;
};

export const SequenceSidebar = ({ sequences, violations, cycles, activeSequenceId }: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingDefaultName, setEditingDefaultName] = useState<string>("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [shuffleDialogOpen, setShuffleDialogOpen] = useState(false);

  const listQueryKey = getListSequencesQueryKey(projectId);

  const createSequence = useCreateSequence({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const updateSequence = useUpdateSequence({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const deleteSequence = useDeleteSequence({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const cloneSequence = useCloneSequence({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const insertSequence = useInsertSequence({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  // The sequence currently open in the overview is the insert target.
  const insertTarget =
    sequences.find((s) => s.uuid === activeSequenceId) ?? sequences.find((s) => s.isMain);

  const sorted = [...sequences].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelect = (uuid: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      // Preserve the current detail level if one is in the URL; leave it
      // undefined otherwise so the persisted per-project preference resolves.
      // The updater form's `prev` is the union of all sibling routes' search
      // params, so we pass only the keys the target route expects.
      search: (prev) => ({ detail: prev.detail, sequence: uuid }),
    });
  };

  const handleCreate = async () => {
    const existingNames = new Set(sequences.map((s) => s.name));
    const defaultName = generateDefaultName(existingNames);
    setEditingDefaultName(defaultName);

    await createSequence.mutateAsync(
      {
        projectId,
        data: { name: defaultName, isMain: false, projectUuid: projectId },
      },
      {
        onSuccess: (response) => {
          if (response.status !== 201) return;
          const newSequence = response.data.sequences.find((s) => s.name === defaultName);
          if (!newSequence) return;
          setEditingRowId(newSequence.uuid);
        },
      },
    );
  };

  const handleConfirmDelete = async (sequenceId: string) => {
    await deleteSequence.mutateAsync(
      { projectId, sequenceId },
      {
        onSuccess: () => {
          setConfirmingDeleteId(null);
          if (activeSequenceId === sequenceId) {
            void navigate({
              to: "/projects/$projectId/overview",
              params: { projectId },
              search: (prev) => ({ detail: prev.detail }),
            });
          }
        },
      },
    );
  };

  const commands = useCommands();

  // Renaming an existing sequence reuses the same inline editor as the
  // post-create flow: seed the default with the current name, then mark the row
  // as editing. The commit goes through handleCommitRename on blur/Enter.
  const beginRename = (sequenceId: string) => {
    const target = sequences.find((sequence) => sequence.uuid === sequenceId);
    if (!target) return;
    setEditingDefaultName(target.name);
    setEditingRowId(sequenceId);
  };

  const handleSetActive = (sequenceId: string, active: boolean) =>
    updateSequence.mutateAsync({ projectId, sequenceId, data: { active } }).then(() => {});

  const handleClone = async (sequenceId: string) => {
    const source = sequences.find((s) => s.uuid === sequenceId);
    if (!source) return;
    const existingNames = new Set(sequences.map((s) => s.name));
    const name = generateCloneName(source.name, existingNames);
    await cloneSequence.mutateAsync(
      { projectId, sequenceId, data: { name } },
      {
        onSuccess: (response) => {
          if (response.status !== 201) return;
          const created = response.data.sequences.find((s) => s.name === name);
          if (!created) return;
          void navigate({
            to: "/projects/$projectId/overview",
            params: { projectId },
            search: (prev) => ({ detail: prev.detail, sequence: created.uuid }),
          });
        },
      },
    );
  };

  const handleInsert = async (sourceSequenceId: string) => {
    if (!insertTarget) return;
    const targetId = insertTarget.uuid;
    await insertSequence.mutateAsync(
      {
        projectId,
        sequenceId: targetId,
        // Append the source as a trailing block; finer placement is a follow-up.
        data: { sourceSequenceId, sectionIndex: insertTarget.sections.length },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetSequenceContentsQueryKey(projectId, targetId),
          });
        },
      },
    );
  };

  const handleShuffleGenerated = (sequenceUuid: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      search: (prev) => ({ detail: prev.detail, sequence: sequenceUuid }),
    });
  };

  useCommandScope(sequenceSidebarScope, {
    createSequencePending: createSequence.isPending,
    createSequence: handleCreate,
    openShuffleDialog: () => setShuffleDialogOpen(true),
    confirmingDeleteSequenceId: confirmingDeleteId,
    deleteSequence: () =>
      confirmingDeleteId ? handleConfirmDelete(confirmingDeleteId) : Promise.resolve(),
    toggleableSequences: sequences.filter((s) => !s.isMain),
    setSequenceActive: handleSetActive,
    cloneableSequences: sequences,
    cloneSequence: handleClone,
    insertSourceSequences: sequences.filter((s) => s.uuid !== insertTarget?.uuid),
    insertTargetName: insertTarget?.name,
    insertSequence: handleInsert,
    renameableSequences: sequences,
    beginRenameSequence: beginRename,
  });

  const handleCommitRename = async (
    sequenceId: string,
    newName: string,
  ): Promise<string | null> => {
    try {
      const response = await updateSequence.mutateAsync({
        projectId,
        sequenceId,
        data: { name: newName },
      });
      if (response.status === 200) {
        void navigate({
          to: "/projects/$projectId/overview",
          params: { projectId },
          search: (prev) => ({ detail: prev.detail, sequence: sequenceId }),
        });
        return null;
      }
      return "Failed to rename";
    } catch (error: unknown) {
      const errorWithReason = error as { reason?: string } | null;
      if (errorWithReason?.reason === "name_conflict") {
        return "A sequence with that name already exists";
      }
      return "Failed to rename";
    }
  };

  return (
    <aside className="flex flex-col w-52 shrink-0 border-r border-border overflow-y-auto">
      <Heading level={4} className="px-3 py-2 border-b border-border">
        Sequences
      </Heading>
      <ul className="flex flex-col py-1">
        {sorted.map((seq) => {
          const status = sequenceStatus(seq, violations, cycles);
          const count = fragmentCount(seq);
          const isActive =
            (activeSequenceId ?? null) === seq.uuid || (!activeSequenceId && seq.isMain);
          const isEditing = editingRowId === seq.uuid;
          const isConfirmingDelete = confirmingDeleteId === seq.uuid;

          return (
            <li key={seq.uuid}>
              <SequenceRow
                sequence={seq}
                status={status}
                count={count}
                isActive={isActive}
                isEditing={isEditing}
                isConfirmingDelete={isConfirmingDelete}
                editingDefaultName={editingDefaultName}
                showInsert={!!insertTarget && insertTarget.uuid !== seq.uuid}
                insertTargetName={insertTarget?.name}
                clonePending={cloneSequence.isPending}
                insertPending={insertSequence.isPending}
                onSelect={() => handleSelect(seq.uuid)}
                onCommitRename={(name) => handleCommitRename(seq.uuid, name)}
                onRenameDone={() => setEditingRowId(null)}
                onRequestRename={() => commands.run("overview:rename-sequence", seq)}
                onConfirmDelete={() => commands.run("overview:delete-sequence")}
                onRequestDelete={() => setConfirmingDeleteId(seq.uuid)}
                onCancelDelete={() => setConfirmingDeleteId(null)}
                onClone={() => commands.run("overview:clone-sequence", seq)}
                onInsert={() => commands.run("overview:insert-sequence", seq)}
                onToggleActive={() => commands.run("overview:toggle-sequence-active", seq)}
              />
            </li>
          );
        })}
      </ul>
      <div className="px-2 py-2 border-t border-border mt-auto flex flex-col gap-1">
        <button
          type="button"
          onClick={() => commands.run("overview:create-sequence")}
          disabled={createSequence.isPending}
          className="w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50"
        >
          + New sequence
        </button>
        <button
          type="button"
          onClick={() => commands.run("overview:shuffle-sequence")}
          className="w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50"
        >
          ⤨ Shuffle…
        </button>
      </div>
      <ShuffleSequenceDialog
        projectId={projectId}
        sequences={sequences}
        open={shuffleDialogOpen}
        onOpenChange={setShuffleDialogOpen}
        onGenerated={handleShuffleGenerated}
      />
    </aside>
  );
};
