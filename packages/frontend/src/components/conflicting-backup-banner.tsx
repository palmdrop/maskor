import { Button } from "@components/ui/button";
import { formatRelativeTime } from "./unsaved-recovery-banner";

type Props = {
  cachedAt: Date;
  onRestoreBackup: () => void;
  onDiscardBackup: () => void;
};

// Shown when an unsaved-content swap was written against a server version that has since advanced —
// another tab saved, or the file was edited externally, after this backup was made. Silently applying
// it would revert that newer work (multi-tab-swap-hardening, Phase 3), so — unlike the normal
// same-baseline recovery, which auto-restores — this requires an explicit choice: keep the current
// server version, or overwrite it with the older backup. Not auto-applied; the buffer holds the
// current server content until the user chooses.
export const ConflictingBackupBanner = ({ cachedAt, onRestoreBackup, onDiscardBackup }: Props) => {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-destructive">
        <span className="font-medium">Backup conflict.</span> You have an unsaved backup from{" "}
        {formatRelativeTime(cachedAt)}, but this content has changed elsewhere since then (another
        tab or an external edit). Restoring the backup will overwrite the newer version.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscardBackup}>
          Keep server version
        </Button>
        <Button variant="destructive" size="sm" onClick={onRestoreBackup}>
          Restore backup
        </Button>
      </div>
    </div>
  );
};
