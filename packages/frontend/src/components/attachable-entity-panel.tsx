import { Link } from "@tanstack/react-router";
import { PenLineIcon, Trash2Icon } from "lucide-react";
import { Button } from "./ui/button";
import { CreateEntityDialog } from "./create-entity-dialog";

type Item = { uuid: string; label: string; editTo?: string };

type AttachableEntityPanelProps = {
  items: Item[];
  isLoading: boolean;
  labelField: string;
  dialogTitle: string;
  entityName: string;
  onConfirmCreate: (label: string, content: string) => Promise<void>;
  onDelete: (item: Item) => void;
  isCreating: boolean;
};

export const AttachableEntityPanel = ({
  items,
  isLoading,
  labelField,
  dialogTitle,
  entityName,
  onConfirmCreate,
  onDelete,
  isCreating,
}: AttachableEntityPanelProps) => {
  return (
    <div className="flex flex-col gap-4 pt-4 max-w-lg">
      <div className="flex items-center justify-between">
        <CreateEntityDialog
          triggerLabel={dialogTitle}
          dialogTitle={dialogTitle}
          entityName={entityName}
          labelField={labelField}
          isPending={isCreating}
          onCreate={onConfirmCreate}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.uuid}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/40"
            >
              <span>{item.label}</span>
              <div className="flex items-center gap-1">
                {item.editTo && (
                  <Link to={item.editTo}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.label}`}>
                      <PenLineIcon />
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(item)}
                  aria-label={`Delete ${item.label}`}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
