import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandEmpty, CommandGroup, CommandItem, defaultFilter } from "cmdk";
import { toast } from "sonner";
import { Picker } from "@/components/picker/Picker";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { useListSequences } from "@api/generated/sequences/sequences";
import { RecordFragmentPick } from "@api/generated/suggestion/suggestion";
import { router } from "@/router";
import { classifyRoute, resolveOpenTarget, type EntityKind } from "./resolve-open-target";
import { useCommandScope } from "../../lib/commands/useCommandScope";
import { quickSwitcherScope } from "../../lib/commands/scopes/quick-switcher";
import { useCommands } from "../../lib/commands/useCommands";

// --- Types ---

interface QuickSwitcherEntry {
  kind: EntityKind;
  uuid: string;
  key: string;
}

const KIND_ORDER: EntityKind[] = ["fragment", "aspect", "note", "reference", "sequence"];

const KIND_LABELS: Record<EntityKind, { plural: string; singular: string }> = {
  fragment: { plural: "Fragments", singular: "Fragment" },
  aspect: { plural: "Aspects", singular: "Aspect" },
  note: { plural: "Notes", singular: "Note" },
  reference: { plural: "References", singular: "Reference" },
  sequence: { plural: "Sequences", singular: "Sequence" },
};

// --- Helpers ---

const entryId = (entry: QuickSwitcherEntry) => `${entry.kind}:${entry.uuid}`;

// Map a list of entities to switcher entries of one kind, sorted by display key.
// `getKey` selects the label (entity `key`, or sequence `name`).
const buildSwitcherEntries = <T extends { uuid: string }>(
  kind: EntityKind,
  items: readonly T[],
  getKey: (item: T) => string,
): QuickSwitcherEntry[] =>
  items
    .map<QuickSwitcherEntry>((item) => ({ kind, uuid: item.uuid, key: getKey(item) }))
    .sort((a, b) => a.key.localeCompare(b.key));

// --- Skeleton rows ---

const SKELETON_WIDTHS = ["55%", "40%", "70%", "48%"];

const SkeletonRows = () => (
  <>
    {SKELETON_WIDTHS.map((width) => (
      <div key={width} className="flex items-center gap-2 px-2 py-1.5">
        <div className="h-4 w-14 animate-pulse rounded bg-muted" />
        <div className="h-4 animate-pulse rounded bg-muted" style={{ width }} />
      </div>
    ))}
  </>
);

// --- Type chip ---

const TypeChip = ({ kind }: { kind: EntityKind }) => (
  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
    {KIND_LABELS[kind].singular}
  </span>
);

// --- Entry row ---

const EntryRow = ({ entry }: { entry: QuickSwitcherEntry }) => (
  <div className="flex items-center gap-2">
    <TypeChip kind={entry.kind} />
    <span className="truncate text-sm">{entry.key}</span>
  </div>
);

// --- QuickSwitcher ---

interface QuickSwitcherProps {
  projectId: string;
}

export const QuickSwitcher = ({ projectId }: QuickSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const fragments = useListFragmentSummaries(projectId);
  const aspects = useListAspects(projectId);
  const notes = useListNotes(projectId);
  const references = useListReferences(projectId);
  const sequences = useListSequences(projectId);

  const queries = [fragments, aspects, notes, references, sequences];
  const isLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.isError);

  const commands = useCommands();
  useCommandScope(quickSwitcherScope, {
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
  });

  // Close and show error toast if any query fails.
  useEffect(() => {
    if (open && hasError) {
      commands.run("quick-switcher:close");
      toast.error("Failed to load entities. Please try again.");
    }
  }, [open, hasError, commands]);

  // Reset query on close.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const entriesByKind = useMemo((): Map<EntityKind, QuickSwitcherEntry[]> => {
    const fragmentItems =
      fragments.data?.status === 200
        ? fragments.data.data.filter((fragment) => !fragment.isDiscarded)
        : [];
    const aspectItems = aspects.data?.status === 200 ? aspects.data.data : [];
    const noteItems = notes.data?.status === 200 ? notes.data.data : [];
    const referenceItems = references.data?.status === 200 ? references.data.data : [];
    const sequenceItems = sequences.data?.status === 200 ? sequences.data.data.sequences : [];

    return new Map<EntityKind, QuickSwitcherEntry[]>([
      ["fragment", buildSwitcherEntries("fragment", fragmentItems, (fragment) => fragment.key)],
      ["aspect", buildSwitcherEntries("aspect", aspectItems, (aspect) => aspect.key)],
      ["note", buildSwitcherEntries("note", noteItems, (note) => note.key)],
      [
        "reference",
        buildSwitcherEntries("reference", referenceItems, (reference) => reference.key),
      ],
      ["sequence", buildSwitcherEntries("sequence", sequenceItems, (sequence) => sequence.name)],
    ]);
  }, [fragments.data, aspects.data, notes.data, references.data, sequences.data]);

  const allEntries = useMemo(
    () => KIND_ORDER.flatMap((kind) => entriesByKind.get(kind) ?? []),
    [entriesByKind],
  );

  const entryMap = useMemo(() => {
    const map = new Map<string, QuickSwitcherEntry>();
    for (const entry of allEntries) {
      map.set(entryId(entry), entry);
    }
    return map;
  }, [allEntries]);

  const entryFilter = useCallback(
    (value: string, search: string) => {
      const entry = entryMap.get(value);
      if (!entry) return 0;
      return defaultFilter(entry.key, search);
    },
    [entryMap],
  );

  const isSearching = query.trim().length > 0;

  const isEmptyProject = !isLoading && allEntries.length === 0;

  const handleSelect = useCallback(
    (entry: QuickSwitcherEntry) => {
      commands.run("quick-switcher:close");

      const matchedRouteIds = router.state.matches.map((match) => match.routeId);
      const currentRoute = classifyRoute(matchedRouteIds);

      // Suggestion-mode fragment picks record a "pick" so the prompting engine
      // treats the picked fragment as recently surfaced (cooldown) and skips
      // avoidance accounting when the user later presses Next — without
      // counting it as engine-rejected. recordPick also bumps
      // voluntary_open_count. Outside suggestion mode, navigation to the
      // fragment editor triggers FragmentPage's recordFragmentVisit, which
      // covers voluntary_open_count for that path.
      if (entry.kind === "fragment" && currentRoute === "suggestion-mode") {
        void RecordFragmentPick(projectId, entry.uuid).catch(() => {
          // Non-critical — stats / cooldown best-effort.
        });
      }

      const target = resolveOpenTarget(currentRoute, entry, projectId);
      void router.navigate(target);
    },
    [projectId, commands],
  );

  const renderItem = (entry: QuickSwitcherEntry) => (
    <CommandItem
      key={entryId(entry)}
      value={entryId(entry)}
      className="flex cursor-pointer items-center rounded px-2 py-1.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      onSelect={() => handleSelect(entry)}
    >
      <EntryRow entry={entry} />
    </CommandItem>
  );

  return (
    <Picker
      open={open}
      onOpenChange={(open) => {
        commands.run(open ? "quick-switcher:open" : "quick-switcher:close");
      }}
      placeholder="Jump to entity…"
      query={query}
      onQueryChange={setQuery}
      filter={entryFilter}
      title="Quick switcher"
    >
      {isLoading ? (
        <SkeletonRows />
      ) : isEmptyProject ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          This project is empty. Create a fragment, aspect, note, or reference to get started.
        </div>
      ) : (
        <>
          <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No matches.
          </CommandEmpty>
          {isSearching
            ? allEntries.map(renderItem)
            : KIND_ORDER.flatMap((kind) => {
                const entries = entriesByKind.get(kind) ?? [];
                if (entries.length === 0) return [];
                return [
                  <CommandGroup
                    key={kind}
                    heading={
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        {KIND_LABELS[kind].plural}
                      </div>
                    }
                  >
                    {entries.map(renderItem)}
                  </CommandGroup>,
                ];
              })}
        </>
      )}
    </Picker>
  );
};
