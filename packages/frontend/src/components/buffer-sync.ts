// When server content flows back into an editor (e.g. after a save), the vault has re-normalized the
// body (`serialize.ts` does `body.trim() + "\n"`), so the returned string can differ from the live
// buffer by trailing whitespace alone. Re-loading the buffer in that case is pointless and harmful: in
// CM6 the @uiw `value` sync replaces the whole document (dropping the caret to the doc end and
// flickering the editor), and in TipTap a full `setContent` resets the selection. Both editors guard
// the re-sync with this predicate — only a difference beyond trailing whitespace is a genuine change
// worth re-loading.
export const isTrailingWhitespaceEquivalent = (a: string, b: string): boolean =>
  a.trimEnd() === b.trimEnd();
