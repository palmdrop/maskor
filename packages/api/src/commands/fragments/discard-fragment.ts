import { isSequenceReadOnly, unplaceFragment } from "@maskor/sequencer";
import type { Command } from "../types";

type DiscardFragmentInput = { fragmentId: string; fragmentKey: string };

export const discardFragmentCommand: Command<DiscardFragmentInput, void> = {
  async execute(ctx, { fragmentId, fragmentKey }) {
    // Remove the fragment from every sequence it sits in BEFORE discarding it, so
    // no stale placement lingers in the sidebar/overview and a later "remove from
    // sequence" can't run against a desynced picture. Composed here at the command
    // level (mirrors how split-fragment.ts composes placement via the sequencer's
    // pure ops) rather than inside storage.discard, which owns single-entity file
    // moves, not multi-entity orchestration.
    //
    // Order matters: storage.discard deletes and re-inserts the fragment's index
    // row, and fragment_positions.fragmentUuid cascade-deletes on that delete — so
    // discarding first would silently drop the placement *index rows* while the
    // sequence YAML files kept the fragment, leaving the two out of sync until the
    // next rebuild. Unplacing first rewrites those YAML files (and their index) so
    // both agree, then the discard's cascade is a harmless no-op. See
    // references/suggestions.md.
    //
    // Import-sequences carry an `origin` and are read-only snapshots of an import
    // order — the sequencer forbids mutating them, and a snapshot legitimately
    // records what was imported, so they are left intact. Each removed sequence's
    // uuid rides along on the single fragment:discarded entry (payload below) — no
    // separate sequence:fragment-unplaced entries (mirrors fragment:split).
    const sequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
    const unplacedFromSequenceUuids: string[] = [];
    for (const sequence of sequences) {
      if (isSequenceReadOnly(sequence)) {
        continue;
      }
      const isPlaced = sequence.sections.some((section) =>
        section.fragments.some((placement) => placement.fragmentUuid === fragmentId),
      );
      if (!isPlaced) {
        continue;
      }
      const updated = unplaceFragment(sequence, fragmentId);
      // TODO: partial-failure shape — if this write throws mid-loop, earlier sequences are already
      // unplaced but the command 500s before the fragment:discarded entry is written, so those
      // unplacements go unlogged (the fragment also stays un-discarded). A retry self-heals (the
      // `isPlaced` check above skips already-unplaced sequences), so this is acceptable for now. If
      // it ever needs fixing, mirror split-fragment.ts's per-sequence warning isolation (try/catch
      // per sequence, collect warnings, return a 200) rather than failing the whole command.
      await ctx.storageService.sequences.write(ctx.projectContext, updated);
      unplacedFromSequenceUuids.push(sequence.uuid);
    }

    await ctx.storageService.fragments.discard(ctx.projectContext, fragmentId);

    return {
      result: undefined,
      logEntries: [
        {
          type: "fragment:discarded" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragmentId, key: fragmentKey },
          payload: { unplacedFromSequenceUuids },
          undoable: true,
        },
      ],
    };
  },
};
