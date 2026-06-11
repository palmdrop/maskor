import { useEffect, useRef, useState } from "react";
import {
  CopyIcon,
  ImportIcon,
  Link2Icon,
  Link2OffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { Badge } from "@components/ui/badge";
import { InlineConfirmActions } from "./InlineConfirmActions";

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

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

const MenuItem = ({ icon, label, ariaLabel, destructive, disabled, onSelect }: MenuItemProps) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onSelect();
    }}
    aria-label={ariaLabel}
    className={`w-full flex items-center gap-2 px-2 py-1 text-sm text-left rounded hover:bg-muted disabled:opacity-50 disabled:pointer-events-none ${
      destructive ? "text-red-600 dark:text-red-500" : "text-foreground"
    }`}
  >
    <span className="shrink-0">{icon}</span>
    {label}
  </button>
);

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
  onRequestRename: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onClone: () => void;
  onInsert: () => void;
  onToggleActive: () => void;
};

// A single sequence entry in the left rail: select target, status dot, import/
// main badges, fragment count, a static inactive-constraint marker, and a single
// hover-revealed "⋯" actions menu (rename/clone/insert/activate/delete). Inline
// rename and delete-confirm are local sub-states driven by the parent.
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
  onRequestRename,
  onConfirmDelete,
  onRequestDelete,
  onCancelDelete,
  onClone,
  onInsert,
  onToggleActive,
}: SequenceRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

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
        <InlineConfirmActions
          confirmLabel="Delete"
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      </div>
    );
  }

  const isInactiveConstraint = !sequence.isMain && !sequence.active;

  const select = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onRequestRename}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
          isActive ? "bg-accent text-accent-foreground" : ""
        } ${isInactiveConstraint ? "opacity-55" : ""}`}
      >
        <StatusDot status={status} />
        <span className="flex-1 truncate">{sequence.name}</span>
        {isInactiveConstraint && (
          <span
            className="shrink-0 text-amber-600 dark:text-amber-500"
            title="Inactive — not used as a constraint"
            aria-label="Inactive constraint"
          >
            <Link2OffIcon size={12} />
          </span>
        )}
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
      <div ref={menuContainerRef} className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          aria-label={`Actions for "${sequence.name}"`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background/80 focus:opacity-100 transition-opacity ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreHorizontalIcon size={14} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 w-44 flex flex-col gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
          >
            <MenuItem
              icon={<PencilIcon size={12} />}
              label="Rename"
              ariaLabel={`Rename sequence "${sequence.name}"`}
              onSelect={() => select(onRequestRename)}
            />
            <MenuItem
              icon={<CopyIcon size={12} />}
              label="Clone"
              ariaLabel={`Clone sequence "${sequence.name}"`}
              disabled={clonePending}
              onSelect={() => select(onClone)}
            />
            {showInsert && (
              <MenuItem
                icon={<ImportIcon size={12} />}
                label={`Insert into "${insertTargetName}"`}
                ariaLabel={`Insert sequence "${sequence.name}" into "${insertTargetName}"`}
                disabled={insertPending}
                onSelect={() => select(onInsert)}
              />
            )}
            {!sequence.isMain && (
              <>
                <MenuItem
                  icon={sequence.active ? <Link2OffIcon size={12} /> : <Link2Icon size={12} />}
                  label={sequence.active ? "Deactivate constraint" : "Activate constraint"}
                  ariaLabel={
                    sequence.active
                      ? `Deactivate sequence "${sequence.name}" as a constraint`
                      : `Activate sequence "${sequence.name}" as a constraint`
                  }
                  onSelect={() => select(onToggleActive)}
                />
                <MenuItem
                  icon={<Trash2Icon size={12} />}
                  label="Delete"
                  ariaLabel={`Delete sequence "${sequence.name}"`}
                  destructive
                  onSelect={() => select(onRequestDelete)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
