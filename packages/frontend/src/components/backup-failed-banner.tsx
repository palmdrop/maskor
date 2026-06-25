// A persistent, non-dismissable warning shown when the unsaved-content swap (the crash net for
// unsaved prose) is failing to write. Prose has no auto-save, so a failing swap means the work on
// screen is unprotected — the user must be told so they can copy it out. Stays up until a swap
// write succeeds again (the owner stops rendering it). (never-lose-writing, Phase 3; TODO #1)
export const BackupFailedBanner = () => {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="font-medium">Unsaved changes are not being backed up.</span>
      <span className="text-destructive/90">
        Copy your work somewhere safe — saving may not be reaching the disk.
      </span>
    </div>
  );
};
