import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Cycle, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import {
  useCreateSequence,
  useUpdateSequence,
  useDeleteSequence,
  getListSequencesQueryKey,
} from "@api/generated/sequences/sequences";

type Props = {
  sequences: Sequence[];
  violations: Violation[];
  cycles: Cycle[];
  activeSequenceId: string | undefined;
};

function sequenceStatus(
  sequence: Sequence,
  violations: Violation[],
  cycles: Cycle[],
): "cycle" | "violation" | "ok" {
  if (cycles.some((c) => c.sequenceUuids.includes(sequence.uuid))) return "cycle";
  if (violations.some((v) => v.secondaryUuid === sequence.uuid)) return "violation";
  return "ok";
}

function fragmentCount(sequence: Sequence): number {
  return sequence.sections.reduce((total, section) => total + section.fragments.length, 0);
}

function generateDefaultName(existingNames: Set<string>): string {
  const base = "New sequence";
  if (!existingNames.has(base)) return base;
  let counter = 2;
  while (existingNames.has(`${base} ${counter}`)) {
    counter++;
  }
  return `${base} ${counter}`;
}

const StatusDot = ({ status }: { status: "cycle" | "violation" | "ok" }) => {
  if (status === "ok") return null;
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        status === "cycle" ? "bg-red-500" : "bg-amber-500"
      }`}
    />
  );
};

type InlineRenameProps = {
  defaultName: string;
  onCommit: (name: string) => Promise<string | null>;
  onDone: () => void;
};

const InlineRename = ({ defaultName, onCommit, onDone }: InlineRenameProps) => {
  const [value, setValue] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = async () => {
    const trimmed = value.trim() || defaultName;
    const errorMessage = await onCommit(trimmed);
    if (errorMessage) {
      setError(errorMessage);
    } else {
      onDone();
    }
  };

  return (
    <div className="px-2 py-1 flex flex-col gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            await commit();
          } else if (e.key === "Escape") {
            onDone();
          }
        }}
        onBlur={commit}
        className="w-full text-sm px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export const SequenceSidebar = ({ sequences, violations, cycles, activeSequenceId }: Props) => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingDefaultName, setEditingDefaultName] = useState<string>("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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

  const sorted = [...sequences].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelect = (uuid: string) => {
    void navigate({
      to: "/projects/$projectId/overview",
      params: { projectId },
      search: { sequence: uuid },
    });
  };

  const handleCreate = () => {
    const existingNames = new Set(sequences.map((s) => s.name));
    const defaultName = generateDefaultName(existingNames);
    setEditingDefaultName(defaultName);

    createSequence.mutate(
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

  const handleConfirmDelete = (sequenceId: string) => {
    deleteSequence.mutate(
      { projectId, sequenceId },
      {
        onSuccess: () => {
          setConfirmingDeleteId(null);
          if (activeSequenceId === sequenceId) {
            void navigate({
              to: "/projects/$projectId/overview",
              params: { projectId },
              search: {},
            });
          }
        },
      },
    );
  };

  const handleCommitRename = async (sequenceId: string, newName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      updateSequence.mutate(
        { projectId, sequenceId, data: { name: newName } },
        {
          onSuccess: (response) => {
            if (response.status === 200) {
              void navigate({
                to: "/projects/$projectId/overview",
                params: { projectId },
                search: { sequence: sequenceId },
              });
              resolve(null);
            } else {
              resolve("Failed to rename");
            }
          },
          onError: (error: unknown) => {
            const errorWithReason = error as { reason?: string } | null;
            if (errorWithReason?.reason === "name_conflict") {
              resolve("A sequence with that name already exists");
            } else {
              resolve("Failed to rename");
            }
          },
        },
      );
    });
  };

  return (
    <aside className="flex flex-col w-52 shrink-0 border-r border-border overflow-y-auto">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
        Sequences
      </div>
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
              {isEditing ? (
                <InlineRename
                  defaultName={editingDefaultName}
                  onCommit={(name) => handleCommitRename(seq.uuid, name)}
                  onDone={() => setEditingRowId(null)}
                />
              ) : isConfirmingDelete ? (
                <div className="px-3 py-1.5 flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground truncate">Delete "{seq.name}"?</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete(seq.uuid)}
                      className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => handleSelect(seq.uuid)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
                      isActive ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <StatusDot status={status} />
                    <span className="flex-1 truncate">{seq.name}</span>
                    {seq.isMain && (
                      <span className="text-xs px-1 rounded border border-border text-muted-foreground shrink-0">
                        Main
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {count}
                    </span>
                  </button>
                  {!seq.isMain && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingDeleteId(seq.uuid);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label={`Delete sequence "${seq.name}"`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-2 py-2 border-t border-border mt-auto">
        <button
          type="button"
          onClick={handleCreate}
          disabled={createSequence.isPending}
          className="w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50"
        >
          + New sequence
        </button>
      </div>
    </aside>
  );
};
