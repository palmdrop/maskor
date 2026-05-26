import { useCallback, useEffect, useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, defaultFilter } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { useListSequences } from "@api/generated/sequences/sequences";
import { router } from "@/router";
import { recordFragmentVisit } from "@api/suggestion";

// --- Types ---

type EntityKind = "fragment" | "aspect" | "note" | "reference" | "sequence";

interface QuickSwitcherEntry {
  kind: EntityKind;
  uuid: string;
  key: string;
}

const KIND_ORDER: EntityKind[] = ["fragment", "aspect", "note", "reference", "sequence"];

const KIND_LABELS: Record<EntityKind, string> = {
  fragment: "Fragments",
  aspect: "Aspects",
  note: "Notes",
  reference: "References",
  sequence: "Sequences",
};

const KIND_CHIP_LABELS: Record<EntityKind, string> = {
  fragment: "Fragment",
  aspect: "Aspect",
  note: "Note",
  reference: "Reference",
  sequence: "Sequence",
};

// --- Helpers ---

const entryId = (entry: QuickSwitcherEntry) => `${entry.kind}:${entry.uuid}`;

const getCurrentRouteKind = (): "fragment-editor" | "suggestion-mode" | "aspect-editor" | "overview" | "other" => {
  for (const match of router.state.matches) {
    const { pathname } = match;
    if (/\/fragments\/[^/]+$/.test(pathname)) return "fragment-editor";
    if (pathname.endsWith("/suggestion")) return "suggestion-mode";
    if (/\/aspects\/[^/]+$/.test(pathname)) return "aspect-editor";
    if (pathname.endsWith("/overview")) return "overview";
  }
  return "other";
};

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
    {KIND_CHIP_LABELS[kind]}
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const QuickSwitcher = ({ projectId, open, onOpenChange }: QuickSwitcherProps) => {
  const [query, setQuery] = useState("");

  // Capture-phase listener intercepts Cmd/Ctrl+O before editors see it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLowerCase() !== "o") return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onOpenChange]);

  const fragments = useListFragmentSummaries(projectId);
  const aspects = useListAspects(projectId);
  const notes = useListNotes(projectId);
  const references = useListReferences(projectId);
  const sequences = useListSequences(projectId);

  const isLoading =
    fragments.isLoading ||
    aspects.isLoading ||
    notes.isLoading ||
    references.isLoading ||
    sequences.isLoading;

  const hasError =
    fragments.isError ||
    aspects.isError ||
    notes.isError ||
    references.isError ||
    sequences.isError;

  // Close and show error toast if any query fails.
  useEffect(() => {
    if (open && hasError) {
      onOpenChange(false);
      toast.error("Failed to load entities. Please try again.");
    }
  }, [open, hasError, onOpenChange]);

  // Reset query on close.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const entriesByKind = useMemo((): Map<EntityKind, QuickSwitcherEntry[]> => {
    const map = new Map<EntityKind, QuickSwitcherEntry[]>();

    const fragmentData =
      fragments.data?.status === 200
        ? fragments.data.data
            .filter((fragment) => !fragment.isDiscarded)
            .map<QuickSwitcherEntry>((fragment) => ({ kind: "fragment", uuid: fragment.uuid, key: fragment.key }))
            .sort((a, b) => a.key.localeCompare(b.key))
        : [];
    map.set("fragment", fragmentData);

    const aspectData =
      aspects.data?.status === 200
        ? aspects.data.data
            .map<QuickSwitcherEntry>((aspect) => ({ kind: "aspect", uuid: aspect.uuid, key: aspect.key }))
            .sort((a, b) => a.key.localeCompare(b.key))
        : [];
    map.set("aspect", aspectData);

    const noteData =
      notes.data?.status === 200
        ? notes.data.data
            .map<QuickSwitcherEntry>((note) => ({ kind: "note", uuid: note.uuid, key: note.key }))
            .sort((a, b) => a.key.localeCompare(b.key))
        : [];
    map.set("note", noteData);

    const referenceData =
      references.data?.status === 200
        ? references.data.data
            .map<QuickSwitcherEntry>((reference) => ({ kind: "reference", uuid: reference.uuid, key: reference.key }))
            .sort((a, b) => a.key.localeCompare(b.key))
        : [];
    map.set("reference", referenceData);

    const sequenceData =
      sequences.data?.status === 200
        ? sequences.data.data.sequences
            .map<QuickSwitcherEntry>((sequence) => ({ kind: "sequence", uuid: sequence.uuid, key: sequence.name }))
            .sort((a, b) => a.key.localeCompare(b.key))
        : [];
    map.set("sequence", sequenceData);

    return map;
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
      onOpenChange(false);
      const currentRoute = getCurrentRouteKind();

      if (entry.kind === "fragment") {
        if (currentRoute === "suggestion-mode") {
          void router.navigate({
            to: "/projects/$projectId/suggestion",
            params: { projectId },
            search: { fragment: entry.uuid },
          });
          void recordFragmentVisit(projectId, entry.uuid).catch(() => {
            // Non-critical — ignore failures.
          });
        } else {
          void router.navigate({
            to: "/projects/$projectId/fragments/$fragmentId",
            params: { projectId, fragmentId: entry.uuid },
          });
        }
      } else if (entry.kind === "aspect") {
        void router.navigate({
          to: "/projects/$projectId/aspects/$aspectId",
          params: { projectId, aspectId: entry.uuid },
        });
      } else if (entry.kind === "note") {
        void router.navigate({
          to: "/projects/$projectId/notes/$noteId",
          params: { projectId, noteId: entry.uuid },
        });
      } else if (entry.kind === "reference") {
        void router.navigate({
          to: "/projects/$projectId/references/$referenceId",
          params: { projectId, referenceId: entry.uuid },
        });
      } else if (entry.kind === "sequence") {
        void router.navigate({
          to: "/projects/$projectId/overview",
          params: { projectId },
          search: { sequence: entry.uuid, density: "full" },
        });
      }
    },
    [projectId, onOpenChange],
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2",
            "overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10",
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Quick switcher</DialogPrimitive.Title>
          <Command loop filter={entryFilter}>
            <CommandInput
              placeholder="Jump to entity…"
              value={query}
              onValueChange={setQuery}
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-80 overflow-y-auto p-1">
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
                  {isSearching ? (
                    allEntries.map(renderItem)
                  ) : (
                    KIND_ORDER.flatMap((kind) => {
                      const entries = entriesByKind.get(kind) ?? [];
                      if (entries.length === 0) return [];
                      return [
                        <CommandGroup
                          key={kind}
                          heading={
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                              {KIND_LABELS[kind]}
                            </div>
                          }
                        >
                          {entries.map(renderItem)}
                        </CommandGroup>,
                      ];
                    })
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
