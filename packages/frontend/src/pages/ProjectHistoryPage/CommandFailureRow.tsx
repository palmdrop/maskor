import type { CommandErrorEntry } from "@maskor/shared";

type Props = {
  entry: CommandErrorEntry;
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

// A command failure — rendered distinctly from action rows: destructive accent,
// no domain chip, no undo affordance. The technical detail sits behind a
// disclosure so the default view stays readable.
export const CommandFailureRow = ({ entry }: Props) => {
  const { friendlyMessage, technicalMessage, commandId } = entry.payload;
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border/50 py-1.5 pl-2 border-l-2 border-l-destructive last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-destructive">{friendlyMessage ?? technicalMessage}</span>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Details</summary>
          <dl className="mt-1 flex flex-col gap-0.5 pl-2">
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Command</dt>
              <dd className="break-all">{commandId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Correlation</dt>
              <dd className="break-all">{entry.correlationId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Detail</dt>
              <dd className="break-all">{technicalMessage}</dd>
            </div>
          </dl>
        </details>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(entry.timestamp)}
      </span>
    </li>
  );
};
