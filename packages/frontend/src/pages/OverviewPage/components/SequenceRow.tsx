import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Click-selected (pinned) without being the active sequence: its members stay
  // cross-highlighted in the active sequence's surfaces while the user keeps
  // working in the active sequence. Never true for the active row.
  isPinned: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  editingDefaultName: string;
  // The active sequence is the insert target; show the insert affordance only on
  // the other rows.
  showInsert: boolean;
  insertTargetName: string | undefined;
  clonePending: boolean;
  insertPending: boolean;
  // Single click: toggle this row's pinned selection (no-op on the active row).
  onSelect: () => void;
  // Double click: make this sequence the active one (navigates).
  onActivate: () => void;
  onCommitRename: (name: string) => Promise<string | null>;
  onRenameDone: () => void;
  onRequestRename: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onClone: () => void;
  onInsert: () => void;
  onToggleActive: () => void;
  // Pointer hover over the row — used to cross-highlight this sequence's members
  // in the active sequence's surfaces. Fired for every row; the highlight
  // derivation ignores a hover on the active row.
  onHoverStart: () => void;
  onHoverEnd: () => void;
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
  isPinned,
  isEditing,
  isConfirmingDelete,
  editingDefaultName,
  showInsert,
  insertTargetName,
  clonePending,
  insertPending,
  onSelect,
  onActivate,
  onCommitRename,
  onRenameDone,
  onRequestRename,
  onConfirmDelete,
  onRequestDelete,
  onCancelDelete,
  onClone,
  onInsert,
  onToggleActive,
  onHoverStart,
  onHoverEnd,
}: SequenceRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is portalled to the body and positioned with `fixed` so it can't be
  // clipped by the sidebar's `overflow-y-auto` or painted under sibling rows.
  // Anchor it to the trigger's right edge, just below it.
  const MENU_WIDTH = 176; // w-44
  const positionMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
  };

  useLayoutEffect(() => {
    if (menuOpen) positionMenu();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    // A scroll or resize moves the anchor out from under the fixed menu; close
    // rather than chase it. Capture so it catches scrolls on inner containers.
    const handleReflow = () => setMenuOpen(false);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
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
    <div className="group relative" onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd}>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onActivate}
        data-pinned={isPinned || undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors ${
          isActive ? "bg-accent text-accent-foreground" : ""
        } ${isPinned ? "ring-1 ring-inset ring-sky-400 dark:ring-sky-500" : ""} ${
          isInactiveConstraint ? "opacity-55" : ""
        }`}
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
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          ref={triggerRef}
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
      </div>
      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            className="fixed z-50 w-44 flex flex-col gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
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
          </div>,
          document.body,
        )}
    </div>
  );
};
