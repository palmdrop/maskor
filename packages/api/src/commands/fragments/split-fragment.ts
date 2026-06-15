import { randomUUID } from "node:crypto";
import type { Comment, Fragment, LogEntry, Sequence } from "@maskor/shared";
import { markerIdSet } from "@maskor/shared";
import type { SplitDelimiter } from "@maskor/importer";
import { splitByDelimiter, deriveKey } from "@maskor/importer";
import { placeFragment } from "@maskor/sequencer";
import type { Command } from "../types";

// A split that yields a single piece is a no-op (no delimiter occurrence in the
// body). The frontend disables Confirm in that case; this is the backend guard.
// Surfaced as a 400 by the route — distinct from a storage/Vault error.
export class SplitNoOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitNoOpError";
  }
}

export type SplitFragmentInput = {
  fragmentId: string;
  delimiter: SplitDelimiter;
};

export type SplitFragmentResult = {
  sourceFragmentUuid: string;
  createdCount: number;
  createdUuids: string[];
};

// The label recorded in the action-log payload + history view.
const delimiterLabel = (delimiter: SplitDelimiter): string =>
  delimiter.type === "heading" ? `heading:${delimiter.level}` : delimiter.type;

export const splitFragmentCommand: Command<SplitFragmentInput, SplitFragmentResult> = {
  async execute(ctx, input) {
    const original = await ctx.storageService.fragments.read(ctx.projectContext, input.fragmentId);
    // Retain heading lines in piece content: a split must never lose prose (unlike
    // import, which lifts the heading into the new entity's title). See the spec.
    const pieces = splitByDelimiter(original.content, input.delimiter, {
      retainHeadingInContent: true,
    });

    if (pieces.length <= 1) {
      throw new SplitNoOpError(
        `Delimiter "${delimiterLabel(input.delimiter)}" yields a single piece — nothing to split.`,
      );
    }

    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const existingKeys = new Set(
      summaries
        .filter((summary) => !summary.isDiscarded)
        .map((summary) => summary.key.toLowerCase()),
    );

    // Read the original's Margin before truncation so anchored comments can follow
    // their blocks into the new pieces (Phase 6 migration, below). The marker set
    // of each piece tells us which piece a given comment's block landed in.
    const originalMargin = await ctx.storageService.margins.read(
      ctx.projectContext,
      input.fragmentId,
    );
    const pieceMarkerSets = pieces.map((piece) => markerIdSet(piece.content));

    // Create pieces 2…N FIRST, while the original still holds the full prose. The
    // split is not one atomic transaction (each write takes the vault lock on its
    // own), so the original is only truncated once every new piece is safely on
    // disk: a failure mid-creation then leaves the source intact rather than
    // losing the prose that had not yet been written elsewhere. New pieces inherit
    // the original's aspects + references, readiness reset to 0. deriveKey suffixes
    // against existing keys (which still include the original's) and keys minted
    // earlier in this split. Anchor markers ride along with their blocks in every
    // piece (no stripping) so each moved comment can be re-anchored in its new
    // piece's Margin.
    const createdUuids: string[] = [];
    // Piece array index (1…N-1) → the new fragment's uuid, for Margin migration.
    const createdUuidByPieceIndex = new Map<number, string>();
    for (let index = 1; index < pieces.length; index++) {
      const piece = pieces[index]!;
      const key = deriveKey({ headingText: piece.title, content: piece.content }, existingKeys);
      const newFragment: Fragment = {
        uuid: randomUUID(),
        key,
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

    // Piece 1 keeps the original's identity: truncate the original to the first
    // piece's content, preserving uuid, key, aspects, readiness, references and
    // unmanaged frontmatter. Done last, after every new piece is persisted (see
    // above), so the original is never the sole holder of prose it is about to drop.
    const firstPiece = pieces[0]!;
    await ctx.storageService.fragments.write(ctx.projectContext, {
      ...original,
      content: firstPiece.content,
    });

    // Placement: in every sequence the original is placed in, insert the new
    // pieces in order immediately after it. Reuses the sequencer's pure
    // placeFragment — no parallel placement logic — and writes each sequence once.
    // No per-placement action-log entry: the single fragment:split entry covers
    // the whole operation.
    const sequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
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
    }

    // Margin comment migration. Each anchored comment follows its block: a comment
    // whose block stayed in piece 1 remains on the original; a comment whose block
    // moved into a piece 2…N migrates (re-anchored — the marker rode along on the
    // moved block) into that piece's Margin. A comment whose marker landed in no
    // piece (e.g. a marker on a heading line the heading split drops) orphans on
    // the original, frozen — the existing orphaned-comment behavior. Notes stay on
    // the original; they annotate the whole fragment, not a block.
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

      // Rewrite the original's Margin only when something actually moved off it.
      if (retainedComments.length !== originalMargin.comments.length) {
        await ctx.storageService.margins.write(ctx.projectContext, original.uuid, {
          notes: originalMargin.notes,
          comments: retainedComments,
        });
      }

      // Seed each receiving piece's Margin with its migrated comments. persistMargin
      // re-derives each anchored comment's excerpt from the new piece's body.
      for (const [pieceArrayIndex, comments] of commentsByPieceIndex) {
        const createdUuid = createdUuidByPieceIndex.get(pieceArrayIndex);
        if (createdUuid) {
          await ctx.storageService.margins.write(ctx.projectContext, createdUuid, {
            notes: "",
            comments,
          });
        }
      }
    }

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
        },
        undoable: false,
      },
    ];

    return {
      result: {
        sourceFragmentUuid: original.uuid,
        createdCount: createdUuids.length,
        createdUuids,
      },
      logEntries,
    };
  },
};
