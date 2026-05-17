import { useState, useEffect } from "react";
import { ChevronUpIcon, FolderIcon, FileIcon } from "lucide-react";
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

export const FolderPicker = ({ onSelect, allowNonExistent = false }: FolderPickerProps) => {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [addressBarValue, setAddressBarValue] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const homeQuery = useFsHome();
  const listQuery = useFsList(currentPath);

  useEffect(() => {
    if (currentPath === null && homeQuery.data) {
      const home = homeQuery.data.data.homedir;
      setCurrentPath(home);
      setAddressBarValue(home);
    }
  }, [currentPath, homeQuery.data]);

  const navigate = (path: string) => {
    setCurrentPath(path);
    setAddressBarValue(path);
  };

  const handleAddressBarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressBarValue) {
      navigate(addressBarValue);
    }
  };

  const fsData = listQuery.data?.data;
  const isLoading = homeQuery.isPending || listQuery.isFetching;
  const listError = listQuery.isError ? listQuery.error : null;

  const isPermissionError =
    listError instanceof ApiRequestError && listError.statusCode === 403;
  const isNotFoundError =
    listError instanceof ApiRequestError && listError.statusCode === 404;

  const entries = fsData?.entries ?? [];
  const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.hidden);
  const isEmpty =
    !isLoading && listError === null && fsData !== undefined && visibleEntries.length === 0;

  const joinPath = (base: string, name: string) =>
    base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;

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
      </form>

      <div className="flex items-center gap-2">
        <Switch id="folder-picker-show-hidden" checked={showHidden} onCheckedChange={setShowHidden} />
        <Label htmlFor="folder-picker-show-hidden">Show hidden</Label>
      </div>

      <div className="overflow-y-auto rounded-lg border border-border" style={{ maxHeight: "320px" }}>
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
            {listError instanceof ApiRequestError
              ? listError.message
              : "Failed to load directory."}
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
                  isDir
                    ? "cursor-pointer hover:bg-muted"
                    : "cursor-default text-muted-foreground",
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
