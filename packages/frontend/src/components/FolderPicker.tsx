import { useState, useEffect, useRef } from "react";
import { ChevronUpIcon, FolderIcon, FileIcon, FolderPlusIcon } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Switch } from "@components/ui/switch";
import { Label } from "@components/ui/label";
import { useFsHome, useFsList } from "@api/fs";
import { ApiRequestError } from "@api/errors";
import { cn } from "@/lib/utils";

type FolderPickerProps = {
  onSelect: (path: string) => void;
  allowNonExistent?: boolean;
};

const joinPath = (base: string, name: string) => {
  const sep = base.includes("\\") ? "\\" : "/";
  return base.endsWith(sep) ? `${base}${name}` : `${base}${sep}${name}`;
};

export const FolderPicker = ({ onSelect, allowNonExistent = false }: FolderPickerProps) => {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [addressBarValue, setAddressBarValue] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const homeQuery = useFsHome();
  const listQuery = useFsList(currentPath);

  useEffect(() => {
    if (currentPath === null && homeQuery.data) {
      const home = homeQuery.data.data.homedir;
      setCurrentPath(home);
      setAddressBarValue(home);
    }
  }, [currentPath, homeQuery.data]);

  useEffect(() => {
    if (newFolderMode) {
      newFolderInputRef.current?.focus();
    }
  }, [newFolderMode]);

  const navigate = (path: string) => {
    setCurrentPath(path);
    setAddressBarValue(path);
    setNewFolderMode(false);
    setNewFolderName("");
  };

  const handleAddressBarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressBarValue) {
      navigate(addressBarValue);
    }
  };

  const handleNewFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed || !currentPath) return;
    navigate(joinPath(currentPath, trimmed));
  };

  const fsData = listQuery.data?.data;
  const isLoading = homeQuery.isPending || listQuery.isFetching;
  const listError = listQuery.isError ? listQuery.error : null;

  const isPermissionError = listError instanceof ApiRequestError && listError.statusCode === 403;
  const isNotFoundError = listError instanceof ApiRequestError && listError.statusCode === 404;

  const entries = fsData?.entries ?? [];
  const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.hidden);
  const isEmpty =
    !isLoading && listError === null && fsData !== undefined && visibleEntries.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleAddressBarSubmit} className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={!fsData?.parent}
          onClick={() => fsData?.parent && navigate(fsData.parent)}
          aria-label="Go to parent directory"
        >
          <ChevronUpIcon />
        </Button>
        <Input
          value={addressBarValue}
          onChange={(e) => setAddressBarValue(e.target.value)}
          placeholder="/path/to/folder"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={currentPath === null}
          onClick={() => setNewFolderMode((prev) => !prev)}
          aria-label="New folder"
          title="New folder"
        >
          <FolderPlusIcon />
        </Button>
      </form>

      {newFolderMode && (
        <form onSubmit={handleNewFolderSubmit} className="flex gap-2">
          <Input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNewFolderMode(false);
                setNewFolderName("");
              }
            }}
          />
          <Button type="submit" size="sm" disabled={!newFolderName.trim()}>
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewFolderMode(false);
              setNewFolderName("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      <div className="flex items-center gap-2">
        <Switch
          id="folder-picker-show-hidden"
          checked={showHidden}
          onCheckedChange={setShowHidden}
        />
        <Label htmlFor="folder-picker-show-hidden">Show hidden</Label>
      </div>

      <div
        className="overflow-y-auto rounded-lg border border-border"
        style={{ maxHeight: "320px" }}
      >
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
        {isPermissionError && (
          <p className="p-4 text-sm text-destructive">
            Permission denied — cannot read this folder.
          </p>
        )}
        {isNotFoundError && allowNonExistent && !isLoading && (
          <p className="p-4 text-sm text-muted-foreground">
            This folder does not exist yet — it will be created.
          </p>
        )}
        {!isPermissionError && !(isNotFoundError && allowNonExistent) && listError !== null && (
          <p className="p-4 text-sm text-destructive">
            {listError instanceof ApiRequestError ? listError.message : "Failed to load directory."}
          </p>
        )}
        {isEmpty && <p className="p-4 text-sm text-muted-foreground">Empty directory.</p>}
        {!isLoading &&
          listError === null &&
          fsData &&
          visibleEntries.map((entry) => {
            const isDir = entry.kind === "directory";
            return (
              <button
                key={entry.name}
                type="button"
                disabled={!isDir}
                onClick={() => isDir && navigate(joinPath(fsData.path, entry.name))}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 transition-colors",
                  isDir ? "cursor-pointer hover:bg-muted" : "cursor-default text-muted-foreground",
                )}
              >
                {isDir ? (
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="flex shrink-0 gap-1">
                  {entry.hasMaskorManifest && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      .maskor
                    </span>
                  )}
                  {entry.hasObsidianDir && (
                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs font-medium text-purple-600">
                      .obsidian
                    </span>
                  )}
                </span>
              </button>
            );
          })}
      </div>

      <Button
        type="button"
        disabled={currentPath === null}
        onClick={() => currentPath !== null && onSelect(currentPath)}
      >
        Choose this folder
      </Button>
    </div>
  );
};
