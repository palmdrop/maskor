import { useQueryClient } from "@tanstack/react-query";
import { useDismissWarning, getListWarningsQueryKey } from "@api/generated/warnings/warnings";
import type { VaultWarning } from "@api/generated/maskorAPI.schemas";
import { useWarnings } from "@hooks/useWarnings";
import { Button } from "@components/ui/button";
import { FileWarningIcon, TagIcon, CopyIcon, type LucideIcon } from "lucide-react";

type WarningKind = VaultWarning["kind"];

const KIND_META: Record<WarningKind, { title: string; hint: string; icon: LucideIcon }> = {
  WRONG_FORMAT_FILE: {
    title: "Wrong-format files",
    hint: "Not a Markdown file. Convert it through Import, or remove it from the folder.",
    icon: FileWarningIcon,
  },
  UNKNOWN_ASPECT_KEY: {
    title: "Unknown aspect keys",
    hint: "Referenced aspect key has no matching aspect. Create the aspect or fix the key.",
    icon: TagIcon,
  },
  UUID_COLLISION: {
    title: "UUID collisions",
    hint: "Two files shared a UUID. A new UUID was assigned automatically — review, then dismiss.",
    icon: CopyIcon,
  },
};

const KIND_ORDER: WarningKind[] = ["WRONG_FORMAT_FILE", "UNKNOWN_ASPECT_KEY", "UUID_COLLISION"];

const WarningContext = ({ warning }: { warning: VaultWarning }) => {
  switch (warning.kind) {
    case "WRONG_FORMAT_FILE":
      return <code className="text-xs">{warning.filePath}</code>;
    case "UNKNOWN_ASPECT_KEY":
      return (
        <span className="text-xs">
          <code>{warning.aspectKey}</code>
          <span className="text-muted-foreground">
            {" "}
            — {warning.fragmentUuids.length} fragment
            {warning.fragmentUuids.length === 1 ? "" : "s"}
          </span>
        </span>
      );
    case "UUID_COLLISION":
      return (
        <span className="text-xs">
          <code>{warning.filePath}</code>
          <span className="text-muted-foreground"> collided with </span>
          <code>{warning.collidingPath}</code>
        </span>
      );
  }
};

const WarningRow = ({ projectId, warning }: { projectId: string; warning: VaultWarning }) => {
  const queryClient = useQueryClient();
  const dismissWarning = useDismissWarning();

  const handleDismiss = async () => {
    if (dismissWarning.isPending) {
      return;
    }
    await dismissWarning.mutateAsync({ projectId, id: warning.id });
    await queryClient.invalidateQueries({ queryKey: getListWarningsQueryKey(projectId) });
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
      <WarningContext warning={warning} />
      {warning.category === "event" && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDismiss}
          disabled={dismissWarning.isPending}
        >
          Dismiss
        </Button>
      )}
    </li>
  );
};

export const DiagnosticsTab = ({ projectId }: { projectId: string }) => {
  const { warnings, isLoading } = useWarnings(projectId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!warnings.length) {
    return <p className="p-4 text-sm text-muted-foreground">No warnings. The vault is healthy.</p>;
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {KIND_ORDER.map((kind) => {
        const group = warnings.filter((warning) => warning.kind === kind);
        if (!group.length) {
          return null;
        }
        const meta = KIND_META[kind];
        const Icon = meta.icon;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-amber-500" />
              <h3 className="text-sm font-medium">
                {meta.title} ({group.length})
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
            <ul className="flex flex-col gap-1">
              {group.map((warning) => (
                <WarningRow key={warning.id} projectId={projectId} warning={warning} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
