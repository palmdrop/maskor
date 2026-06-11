import { useEffect, useRef, useState } from "react";
import { CopyIcon, ImportIcon, Link2Icon, Link2OffIcon, Trash2Icon } from "lucide-react";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { Badge } from "@components/ui/badge";

type SequenceStatus = "cycle" | "violation" | "ok";

const StatusDot = ({ status }: { status: SequenceStatus }) => {
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

type SequenceRowProps = {
  sequence: Sequence;
  status: SequenceStatus;
  count: number;
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  editingDefaultName: string;
  // The active sequence is the insert target; show the insert affordance only on
  // the other rows.
  showInsert: boolean;
  insertTargetName: string | undefined;
  clonePending: boolean;
  insertPending: boolean;
  onSelect: () => void;
  onCommitRename: (name: string) => Promise<string | null>;
  onRenameDone: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onClone: () => void;
  onInsert: () => void;
  onToggleActive: () => void;
};

// A single sequence entry in the left rail: select target, status dot, import/
// main badges, fragment count, and the hover-revealed clone/insert/activate/
// delete affordances. Inline rename and delete-confirm are local sub-states
// driven by the parent.
export const SequenceRow = ({
  sequence,
  status,
  count,
  isActive,
  isEditing,
  isConfirmingDelete,
  editingDefaultName,
  showInsert,
  insertTargetName,
  clonePending,
  insertPending,
  onSelect,
  onCommitRename,
  onRenameDone,
  onConfirmDelete,
  onRequestDelete,
  onCancelDelete,
  onClone,
  onInsert,
  onToggleActive,
}: SequenceRowProps) => {
  if (isEditing) {
    return (
      <InlineRename
        defaultName={editingDefaultName}
        onCommit={onCommitRename}
        onDone={onRenameDone}
      />
    );
  }

  if (isConfirmingDelete) {
    return (
      <div className="px-3 py-1.5 flex flex-col gap-1">
        <p className="text-xs text-muted-foreground truncate">
          Delete &quot;{sequence.name}&quot;?
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onConfirmDelete}
            className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
          isActive ? "bg-accent text-accent-foreground" : ""
        } ${!sequence.isMain && !sequence.active ? "opacity-55" : ""}`}
      >
        <StatusDot status={status} />
        <span className="flex-1 truncate">{sequence.name}</span>
        {sequence.origin && (
          <Badge
            variant="outline"
            className="shrink-0"
            title={`Imported from ${sequence.origin.fileName} on ${new Date(
              sequence.origin.importedAt,
            ).toLocaleDateString()}`}
          >
            imported
          </Badge>
        )}
        {sequence.isMain && (
          <Badge variant="outline" className="shrink-0">
            Main
          </Badge>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{count}</span>
      </button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClone();
          }}
          disabled={clonePending}
          className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
          aria-label={`Clone sequence "${sequence.name}"`}
          title="Clone this sequence"
        >
          <CopyIcon size={12} />
        </button>
        {showInsert && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInsert();
            }}
            disabled={insertPending}
            className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
            aria-label={`Insert sequence "${sequence.name}" into "${insertTargetName}"`}
            title={`Insert into "${insertTargetName}"`}
          >
            <ImportIcon size={12} />
          </button>
        )}
        {!sequence.isMain && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleActive();
              }}
              className={`p-1 rounded hover:text-foreground hover:bg-background/80 transition-opacity ${
                sequence.active
                  ? "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                  : "text-amber-600 dark:text-amber-500"
              }`}
              aria-label={
                sequence.active
                  ? `Deactivate sequence "${sequence.name}" as a constraint`
                  : `Activate sequence "${sequence.name}" as a constraint`
              }
              title={
                sequence.active
                  ? "Active constraint — click to deactivate"
                  : "Inactive — click to use as a constraint"
              }
            >
              {sequence.active ? <Link2Icon size={12} /> : <Link2OffIcon size={12} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete();
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label={`Delete sequence "${sequence.name}"`}
            >
              <Trash2Icon size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
