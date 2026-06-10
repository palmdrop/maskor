import type { ActionLogEntry, LogEntry } from "@maskor/shared";
import { DOMAIN_LABELS, isLinkable, renderEntryText } from "./renderers/registry";
import { EntryLink } from "./EntryLink";
import { CommandFailureRow } from "./CommandFailureRow";
import { Heading } from "@components/heading";

export type ExistenceMaps = {
  fragment: ReadonlySet<string>;
  aspect: ReadonlySet<string>;
  note: ReadonlySet<string>;
  reference: ReadonlySet<string>;
};

type Props = {
  projectId: string;
  entries: LogEntry[];
  existence: ExistenceMaps;
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const formatDay = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const groupByDay = (entries: LogEntry[]): [string, LogEntry[]][] => {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const day = new Date(entry.timestamp).toDateString();
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(entry);
  }
  return [...groups.entries()];
};

const entityExists = (entry: ActionLogEntry, existence: ExistenceMaps): boolean => {
  switch (entry.target.type) {
    case "fragment":
      return existence.fragment.has(entry.target.uuid);
    case "aspect":
      return existence.aspect.has(entry.target.uuid);
    case "note":
      return existence.note.has(entry.target.uuid);
    case "reference":
      return existence.reference.has(entry.target.uuid);
    case "sequence":
      return false;
    case "draft":
    case "margin":
      // Drafts and Margins aren't tracked in ExistenceMaps; treat them as never linkable
      // (history shows the entry but without a navigable target).
      return false;
  }
};

export const ActionLogList = ({ projectId, entries, existence }: Props) => {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions recorded yet.</p>;
  }

  const groups = groupByDay(entries);

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, dayEntries]) => (
        <section key={day} className="flex flex-col gap-1">
          <Heading level={4} className="pb-1 border-b border-border">
            {formatDay(dayEntries[0]!.timestamp)}
          </Heading>
          <ul className="flex flex-col">
            {dayEntries.map((entry) => {
              if (entry.type === "command:error") {
                return <CommandFailureRow key={entry.id} entry={entry} />;
              }
              const text = renderEntryText(entry);
              const linkable = isLinkable(entry) && entityExists(entry, existence);
              const body = linkable ? (
                <EntryLink entry={entry} projectId={projectId}>
                  {text}
                </EntryLink>
              ) : (
                text
              );
              return (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/50 last:border-0"
                >
                  <span
                    className={[
                      "flex items-baseline gap-2 text-sm",
                      entry.undoable ? "text-foreground" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {DOMAIN_LABELS[entry.target.type]}
                    </span>
                    <span>{body}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatTime(entry.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
