import type { Piece } from "@maskor/importer";
import { deriveKey } from "@maskor/importer";

// Piece 1 keeps the original fragment's identity (same uuid). Its key normally
// stays too, but when the split strips the heading from the body and the
// original's content starts with a heading, that heading becomes the key — the
// original is renamed to match, mirroring the new pieces (see
// `specifications/fragment-split.md`). The original's leading heading would
// otherwise be lost: it is dropped from the body but, unlike the new pieces, has
// nowhere to go since the original keeps its old key.
//
// `otherKeys` is the lowercased key set of all OTHER non-discarded fragments — it
// must NOT contain the original's own key, so a heading matching the current key
// resolves back to that key (no false collision, no rename). The resolved key is
// reserved in `otherKeys` (whether renamed or kept) so the later pieces avoid it.
export const resolveOriginalPieceKey = (
  firstPiece: Piece,
  originalKey: string,
  keepHeadingInBody: boolean,
  otherKeys: Set<string>,
): { key: string; renamed: boolean } => {
  if (!keepHeadingInBody && firstPiece.title) {
    // Derive with the original's own key excluded, so a heading matching the
    // current key resolves back to it (no rename) rather than getting suffixed.
    const key = deriveKey(
      { headingText: firstPiece.title, content: firstPiece.content },
      otherKeys,
    );

    // Reserve the original's OLD key too: the rename runs after the new pieces are
    // written (Phase B ordering), so a later piece must not claim the not-yet-freed
    // key and collide with the original mid-split.
    otherKeys.add(originalKey.toLowerCase());

    return { key, renamed: key.toLowerCase() !== originalKey.toLowerCase() };
  }

  otherKeys.add(originalKey.toLowerCase());

  return { key: originalKey, renamed: false };
};
