import { Button } from "@components/ui/button";

type Props = {
  cachedAt: Date;
  onDismiss: () => void;
};

// Small inline helper — there's no shared relative-time util in the
// codebase yet. If one shows up, swap to it. Keep this in sync with the
// banner's copy expectations.
export const formatRelativeTime = (
  from: Date,
  now: Date = new Date(),
): string => {
  const diffMs = now.getTime() - from.getTime();
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 2) return "a minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 2) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return "yesterday";
  return `${days} days ago`;
};

export const UnsavedRecoveryBanner = ({ cachedAt, onDismiss }: Props) => {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
    >
      <span className="text-muted-foreground">
        You have unsaved changes from {formatRelativeTime(cachedAt)}. They've been restored.
      </span>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Restore from server
      </Button>
    </div>
  );
};
