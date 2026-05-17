import { useState, useEffect } from "react";
import { useSettings, usePatchSettings } from "@api/settings";
import { FolderPicker } from "@components/FolderPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

export const SettingsSection = () => {
  const { data: envelope, isLoading, isError } = useSettings();
  const patchMutation = usePatchSettings();

  const [managedRootInput, setManagedRootInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const settings = envelope?.status === 200 ? envelope.data : null;

  useEffect(() => {
    if (settings) {
      setManagedRootInput(settings.maskorManagedRoot);
    }
  }, [settings?.maskorManagedRoot]);

  const handleSave = () => {
    if (!managedRootInput.trim()) return;
    setSaved(false);
    patchMutation.mutate(
      { maskorManagedRoot: managedRootInput.trim() },
      {
        onSuccess: () => {
          setSaved(true);
        },
      },
    );
  };

  const handlePickerSelect = (path: string) => {
    setManagedRootInput(path);
    setPickerOpen(false);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  if (isError || !settings) {
    return <p className="text-sm text-destructive">Failed to load settings.</p>;
  }

  return (
    <>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose folder</DialogTitle>
          </DialogHeader>
          <FolderPicker onSelect={handlePickerSelect} />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        {settings.warning && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {settings.warning}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maskor-managed-root">Where to keep Maskor-managed projects</Label>
          <div className="flex gap-2">
            <Input
              id="maskor-managed-root"
              value={managedRootInput}
              onChange={(e) => {
                setManagedRootInput(e.target.value);
                setSaved(false);
              }}
              placeholder="/path/to/Maskor"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              Browse…
            </Button>
          </div>
        </div>

        {patchMutation.error && (
          <p className="text-xs text-destructive">{patchMutation.error.message}</p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!managedRootInput.trim() || patchMutation.isPending}
          >
            {patchMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {saved && <p className="text-xs text-muted-foreground">Saved.</p>}
        </div>
      </div>
    </>
  );
};
