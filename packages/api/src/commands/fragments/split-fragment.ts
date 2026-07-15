import { randomUUID } from "node:crypto";
import type { Comment, Fragment, LogEntry, Sequence } from "@maskor/shared";
import { markerIdSet, validateEntityKey, validateSequenceName } from "@maskor/shared";
import type { SplitDelimiter } from "@maskor/importer";
import { splitByDelimiter, deriveKey } from "@maskor/importer";
import { placeFragment } from "@maskor/sequencer";
import type { Command } from "../types";
import { resolveOriginalPieceKey } from "./split-piece-keys";

// A split that yields a single piece is a no-op (no delimiter occurrence in the
// body). The frontend disables Confirm in that case; this is the backend guard.
// Surfaced as a 400 by the route — distinct from a storage/Vault error.
export class SplitNoOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitNoOpError";
  }
}

// A user-supplied per-piece key collides with an existing fragment or another
// piece in the same split. Surfaced as a 400 (SPLIT_KEY_CONFLICT).
export class SplitKeyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitKeyConflictError";
  }
}

// A user-supplied per-piece key is malformed (empty / illegal characters) — a
// shape problem, distinct from a name collision. Surfaced as a 400
// (SPLIT_KEY_INVALID). The dialog validates shape in-modal, so this is the rare
// fall-through (e.g. a direct API call).
export class SplitKeyInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitKeyInvalidError";
  }
}

// The opt-in "add pieces to a new sequence" name is empty (or whitespace-only).
// Validated in Phase A so a rejected name leaves the vault untouched. Surfaced as
// a 400 (SPLIT_SEQUENCE_NAME_INVALID). The dialog gates Confirm on a non-empty
// name, so this is the rare fall-through (e.g. a direct API call).
export class SplitSequenceNameInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitSequenceNameInvalidError";
  }
}

// A user-chosen key for a piece (pieceIndex is 1-based, as in the preview). An
// override for piece 1 renames the original fragment; it takes precedence over
// the automatic rename to a stripped heading.
export type SplitPieceKey = {
  pieceIndex: number;
  key: string;
};

export type SplitFragmentInput = {
  fragmentId: string;
  delimiter: SplitDelimiter;
  pieceKeys?: SplitPieceKey[];
  // When false (the default), a heading line that starts a piece is stripped from
  // the body and becomes that piece's key. This includes piece 1: if the original's
  // body starts with a heading, the original is renamed to its heading-derived key
  // (its leading heading would otherwise be lost, since — unlike the new pieces — it
  // keeps its old key). When true, headings stay in the body and the original keeps
  // its key (the previous behavior). Only affects heading splits.
  keepHeadingInBody?: boolean;
  // Opt-in: also create a new secondary sequence holding all resulting pieces in
  // split order (piece 1 = the original, then pieces 2…N). Omitted → no sequence
  // is created. The name is validated (trimmed, non-empty) in Phase A.
  intoSequence?: { name: string };
};

export type SplitFragmentResult = {
  sourceFragmentUuid: string;
  createdCount: number;
  createdUuids: string[];
  // Non-fatal follow-up failures (sequence placement, Margin migration) after the
  // split's core writes committed. The prose is safe — every piece is on disk and
  // the original is truncated — so these surface as warnings on a 200 rather than
  // a bogus "Split failed" 500. Empty on a clean split.
  warnings: string[];
  // The new secondary sequence created when `intoSequence` was requested and the
  // Phase C write succeeded. Absent when not requested, or when the write failed
  // (a warning is surfaced instead — see `warnings`).
  createdSequenceUuid?: string;
  createdSequenceName?: string;
  // The original's new key when it was renamed — to its leading heading (heading
  // stripped from the body) or to a user-chosen piece-1 key override. Absent when
  // the original kept its key.
  originalKeyRenamedTo?: string;
};

// The label recorded in the action-log payload + history view.
const delimiterLabel = (delimiter: SplitDelimiter): string =>
  delimiter.type === "heading" ? `heading:${delimiter.level}` : delimiter.type;

// Validate a user-chosen piece key (same rules as entity creation) and assert it
// does not collide with an existing fragment key or one already minted earlier in
// this split. On success the key is reserved in `existingKeys` so a later piece
// can't reuse it. `existingKeys` holds lowercased keys (the case-insensitive
// uniqueness space the vault enforces).
const resolveOverrideKey = (rawKey: string, existingKeys: Set<string>): string => {
  let key: string;
  try {
    key = validateEntityKey(rawKey);
  } catch (error) {
    throw new SplitKeyInvalidError((error as Error).message);
  }
  if (existingKeys.has(key.toLowerCase())) {
    throw new SplitKeyConflictError(`A fragment with the key "${key}" already exists.`);
  }
  existingKeys.add(key.toLowerCase());
  return key;
};

export const splitFragmentCommand: Command<SplitFragmentInput, SplitFragmentResult> = {
  async execute(ctx, input) {
    // ---- Phase A: reads + validation/derivation. Nothing is written yet, so any
    // throw here (no-op split, malformed/conflicting key) fails the command with
    // the vault untouched.
    const original = await ctx.storageService.fragments.read(ctx.projectContext, input.fragmentId);
    // Default: strip the heading that starts each piece from its body (it becomes the
    // piece's key). Opt in to keep headings in the body via `keepHeadingInBody`. Only
    // heading splits carry a heading; the other delimiters ignore the option.
    const keepHeadingInBody = input.keepHeadingInBody ?? false;
    const pieces = splitByDelimiter(original.content, input.delimiter, {
      retainHeadingInContent: keepHeadingInBody,
    });

    if (pieces.length <= 1) {
      throw new SplitNoOpError(
        `Delimiter "${delimiterLabel(input.delimiter)}" yields a single piece — nothing to split.`,
      );
    }

    // Opt-in "add pieces to a new sequence" name: validated here in Phase A so a
    // blank name rejects the whole split with nothing written. Sequence names are
    // not unique (no collision guard beyond trim/non-empty — matches createSequence).
    let sequenceName: string | undefined;
    if (input.intoSequence) {
      try {
        sequenceName = validateSequenceName(input.intoSequence.name);
      } catch (error) {
        throw new SplitSequenceNameInvalidError((error as Error).message);
      }
    }

    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const existingKeys = new Set(
      summaries
        .filter((summary) => !summary.isDiscarded)
        .map((summary) => summary.key.toLowerCase()),
    );

    // Read the original's Margin before truncation so anchored comments can follow
    // their blocks into the new pieces (migration, below). The marker set of each
    // piece tells us which piece a given comment's block landed in.
    const originalMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      input.fragmentId,
    );
    const pieceMarkerSets = pieces.map((piece) => markerIdSet(piece.content));

    // User-chosen key overrides, keyed by 1-based pieceIndex. Every piece's key is
    // resolved HERE, before the first write, so a malformed or conflicting override
    // rejects the split with nothing on disk — no orphan pieces from a mid-loop
    // validation failure.
    const overrideKeyByPieceIndex = new Map<number, string>();
    for (const override of input.pieceKeys ?? []) {
      overrideKeyByPieceIndex.set(override.pieceIndex, override.key);
    }

    // Key derivation works against the keys of all OTHER fragments — the original's
    // own key is excluded so it is never a false collision (its old key is freed on a
    // rename, and re-reserved below when it keeps its key). Piece 1's resolved key is
    // reserved so the later pieces avoid it. A user override for piece 1 renames the
    // original explicitly and wins over the automatic rename to a stripped heading;
    // resubmitting the original's own key is not a collision (it resolves to no
    // rename).
    const otherKeys = new Set(existingKeys);
    otherKeys.delete(original.key.toLowerCase());
    const pieceOneOverride = overrideKeyByPieceIndex.get(1);
    let originalKeyResolution: { key: string; renamed: boolean };
    if (pieceOneOverride !== undefined) {
      const key = resolveOverrideKey(pieceOneOverride, otherKeys);
      // Reserve the original's OLD key too: the rename runs after the new pieces are
      // written (Phase B ordering), so a later piece must not claim the not-yet-freed
      // key and collide with the original mid-split.
      otherKeys.add(original.key.toLowerCase());
      originalKeyResolution = {
        key,
        renamed: key.toLowerCase() !== original.key.toLowerCase(),
      };
    } else {
      originalKeyResolution = resolveOriginalPieceKey(
        pieces[0]!,
        original.key,
        keepHeadingInBody,
        otherKeys,
      );
    }
    // Piece array index (1…N-1) → the resolved key for that new piece.
    const keyByPieceIndex = new Map<number, string>();
    for (let index = 1; index < pieces.length; index++) {
      const piece = pieces[index]!;
      // pieceIndex is 1-based (matches the preview); array index 1 is piece 2.
      const override = overrideKeyByPieceIndex.get(index + 1);
      const key = override
        ? resolveOverrideKey(override, otherKeys)
        : deriveKey({ headingText: piece.title, content: piece.content }, otherKeys);
      keyByPieceIndex.set(index, key);
    }

    // ---- Phase B: core writes. A throw here still fails the command (500): the
    // split's essence has not fully committed. Ordering protects the prose:
    // create pieces 2…N FIRST, while the original still holds the full body. The
    // split is not one atomic transaction (each write takes the vault lock on its
    // own), so the original is only truncated once every new piece is safely on
    // disk — a failure mid-creation leaves the source intact rather than losing
    // the prose that had not yet been written elsewhere. New pieces inherit the
    // original's aspects + references, readiness reset to 0. Anchor markers ride
    // along with their blocks in every piece (no stripping) so each moved comment
    // can be re-anchored in its new piece's Margin.
    const createdUuids: string[] = [];
    // Piece array index (1…N-1) → the new fragment's uuid, for Margin migration.
    const createdUuidByPieceIndex = new Map<number, string>();
    for (let index = 1; index < pieces.length; index++) {
      const piece = pieces[index]!;
      const newFragment: Fragment = {
        uuid: randomUUID(),
        key: keyByPieceIndex.get(index)!,
        content: piece.content,
        readiness: 0,
        contentHash: "",
        // New piece — fresh createdAt. The original keeps its own createdAt (it is truncated in
        // place, preserving identity — ADR 0014).
        createdAt: new Date(),
        updatedAt: new Date(),
        references: [...original.references],
        isDiscarded: false,
        aspects: structuredClone(original.aspects),
      };
      const written = await ctx.storageService.fragments.write(ctx.projectContext, newFragment);
      createdUuids.push(written.uuid);
      createdUuidByPieceIndex.set(index, written.uuid);
    }

    // Piece 1 keeps the original's identity (uuid, aspects, readiness, references,
    // unmanaged frontmatter): truncate the original to the first piece's content.
    // Its key changes only on a user-chosen piece-1 override, or when the heading
    // was stripped and the body started with one — then the original is renamed and
    // the service cascades the file + Margin rename and rewrites
    // `[[fragments/oldKey]]` links.
    // Done last, after every new piece is persisted (see above), so the original is
    // never the sole holder of prose it is about to drop.
    const firstPiece = pieces[0]!;
    await ctx.storageService.fragments.write(ctx.projectContext, {
      ...original,
      key: originalKeyResolution.key,
      content: firstPiece.content,
    });

    // ---- Phase C: follow-up writes. The split has committed (all prose is on
    // disk); a failure from here on must not surface as "Split failed". Each
    // failure is logged server-side and collected as a warning returned on the
    // 200 result instead.
    const warnings: string[] = [];

    // Placement: in every sequence the original is placed in, insert the new
    // pieces in order immediately after it. Reuses the sequencer's pure
    // placeFragment — no parallel placement logic — and writes each sequence once.
    // No per-placement action-log entry: the single fragment:split entry covers
    // the whole operation. Per-sequence failure isolation: one sequence failing
    // to update does not stop the others.
    let sequences: Sequence[] = [];
    try {
      sequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
    } catch (error) {
      ctx.logger.warn({ error }, "split: reading sequences for placement failed");
      warnings.push(
        "The new pieces could not be inserted into the original's sequences. Place them manually.",
      );
    }
    for (const sequence of sequences) {
      let originalSectionUuid: string | undefined;
      let originalPosition: number | undefined;
      for (const section of sequence.sections) {
        const placement = section.fragments.find(
          (fragment) => fragment.fragmentUuid === input.fragmentId,
        );
        if (placement) {
          originalSectionUuid = section.uuid;
          originalPosition = placement.position;
          break;
        }
      }
      if (originalSectionUuid === undefined || originalPosition === undefined) {
        continue;
      }

      try {
        let updated: Sequence = sequence;
        createdUuids.forEach((createdUuid, offset) => {
          updated = placeFragment(
            updated,
            createdUuid,
            originalSectionUuid as string,
            (originalPosition as number) + 1 + offset,
          );
        });
        await ctx.storageService.sequences.write(ctx.projectContext, updated);
      } catch (error) {
        ctx.logger.warn(
          { error, sequenceUuid: sequence.uuid },
          "split: placing pieces into sequence failed",
        );
        warnings.push(
          `The new pieces could not be inserted into sequence "${sequence.name}". Place them manually.`,
        );
      }
    }

    // Margin comment migration. Each anchored comment follows its block: a comment
    // whose block stayed in piece 1 remains on the original; a comment whose block
    // moved into a piece 2…N migrates (re-anchored — the marker rode along on the
    // moved block) into that piece's Margin. A comment whose marker landed in no
    // piece (e.g. a marker on a heading line the heading split drops) orphans on
    // the original, frozen — the existing orphaned-comment behavior. Notes stay on
    // the original; they annotate the whole fragment, not a block. Failure here is
    // a warning too: the comments still exist on the original's Margin (orphaned
    // against the truncated body) rather than being lost.
    if (originalMargin && originalMargin.comments.length > 0) {
      const retainedComments: Comment[] = [];
      const commentsByPieceIndex = new Map<number, Comment[]>();
      for (const comment of originalMargin.comments) {
        const pieceArrayIndex = pieceMarkerSets.findIndex((markers) =>
          markers.has(comment.markerId),
        );
        if (pieceArrayIndex <= 0) {
          retainedComments.push(comment);
        } else {
          const list = commentsByPieceIndex.get(pieceArrayIndex) ?? [];
          list.push(comment);
          commentsByPieceIndex.set(pieceArrayIndex, list);
        }
      }

      try {
        // Seed each receiving piece's Margin with its migrated comments FIRST, and
        // only then rewrite the original's Margin (only when something actually
        // moved off it). A failure between the two then leaves a comment present
        // on both Margins (duplicated, orphaned on the original) — never on
        // neither.
        for (const [pieceArrayIndex, comments] of commentsByPieceIndex) {
          const createdUuid = createdUuidByPieceIndex.get(pieceArrayIndex);
          if (createdUuid) {
            await ctx.storageService.margins.write(ctx.projectContext, createdUuid, {
              notes: "",
              comments,
            });
          }
        }
        if (retainedComments.length !== originalMargin.comments.length) {
          await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
            notes: originalMargin.notes,
            comments: retainedComments,
          });
        }
      } catch (error) {
        ctx.logger.warn({ error }, "split: migrating Margin comments failed");
        warnings.push(
          "Comments could not be migrated to the new pieces. They remain on the original fragment.",
        );
      }
    }

    // Opt-in new sequence: create a plain user-authored secondary sequence holding
    // all resulting pieces in split order — piece 1 (the original) first, then the
    // created pieces 2…N. `isMain: false`, `active: true` (a user-requested ordering
    // constraint, satisfied by construction: the split inserts the pieces
    // contiguously after the original everywhere, so no violation is manufactured at
    // creation time), no `origin` (an origin would make it read-only — ADR 0014). A
    // write failure degrades to a warning like the other Phase C follow-ups.
    let createdSequenceUuid: string | undefined;
    let createdSequenceName: string | undefined;
    if (sequenceName) {
      try {
        const orderedFragmentUuids = [original.uuid, ...createdUuids];
        const newSequence: Sequence = {
          uuid: randomUUID(),
          name: sequenceName,
          isMain: false,
          active: true,
          projectUuid: ctx.projectContext.projectUUID,
          sections: [
            {
              uuid: randomUUID(),
              name: "Main",
              fragments: orderedFragmentUuids.map((fragmentUuid, position) => ({
                uuid: randomUUID(),
                fragmentUuid,
                position,
              })),
            },
          ],
        };
        await ctx.storageService.sequences.write(ctx.projectContext, newSequence);
        createdSequenceUuid = newSequence.uuid;
        createdSequenceName = sequenceName;
      } catch (error) {
        ctx.logger.warn({ error }, "split: creating the pieces sequence failed");
        warnings.push(
          `The pieces could not be added to a new sequence "${sequenceName}". Create it manually.`,
        );
      }
    }

    const originalKeyRenamedTo = originalKeyResolution.renamed
      ? originalKeyResolution.key
      : undefined;

    const logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[] = [
      {
        type: "fragment:split",
        actor: ctx.actor,
        target: { type: "fragment" as const, uuid: original.uuid, key: original.key },
        payload: {
          sourceFragmentUuid: original.uuid,
          delimiter: delimiterLabel(input.delimiter),
          createdCount: createdUuids.length,
          createdUuids,
          ...(createdSequenceUuid ? { createdSequenceUuid, createdSequenceName } : {}),
          ...(originalKeyRenamedTo ? { originalKeyRenamedTo } : {}),
        },
        undoable: false,
      },
    ];

    return {
      result: {
        sourceFragmentUuid: original.uuid,
        createdCount: createdUuids.length,
        createdUuids,
        warnings,
        ...(createdSequenceUuid ? { createdSequenceUuid, createdSequenceName } : {}),
        ...(originalKeyRenamedTo ? { originalKeyRenamedTo } : {}),
      },
      logEntries,
    };
  },
};
