import { randomUUID } from "node:crypto";
import type { Fragment, LogEntry, Sequence } from "@maskor/shared";
import { stripCommentMarkers } from "@maskor/shared";
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
    const pieces = splitByDelimiter(original.content, input.delimiter);

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

    // Piece 1 keeps the original's identity: truncate the original to the first
    // piece's content, preserving uuid, key, aspects, readiness, references and
    // unmanaged frontmatter. Markers on blocks that stayed in piece 1 ride along;
    // markers on blocks that moved to later pieces are simply absent from this
    // slice, so the existing orphaned-comment path on the original's Margin
    // handles their comments.
    const firstPiece = pieces[0]!;
    await ctx.storageService.fragments.write(ctx.projectContext, {
      ...original,
      content: firstPiece.content,
    });

    // Pieces 2…N become new fragments inheriting the original's aspects +
    // references, readiness reset to 0. deriveKey suffixes against existing keys
    // (which still include the original's) and keys minted earlier in this split.
    // Anchor markers are stripped from the new pieces (interim behavior; comment
    // migration is a deferred phase — see specifications/fragment-split.md).
    const createdUuids: string[] = [];
    for (let index = 1; index < pieces.length; index++) {
      const piece = pieces[index]!;
      const key = deriveKey({ headingText: piece.title, content: piece.content }, existingKeys);
      const newFragment: Fragment = {
        uuid: randomUUID(),
        key,
        content: stripCommentMarkers(piece.content),
        readiness: 0,
        contentHash: "",
        updatedAt: new Date(),
        references: [...original.references],
        isDiscarded: false,
        aspects: structuredClone(original.aspects),
      };
      const written = await ctx.storageService.fragments.write(ctx.projectContext, newFragment);
      createdUuids.push(written.uuid);
    }

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
