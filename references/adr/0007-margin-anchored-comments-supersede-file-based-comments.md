# Margin-anchored comments supersede file-based comments

**Status**: accepted — supersedes the "comments are not anchor-scoped" prior decision in `specifications/document-links.md`

`document-links.md` decided comments would each be a standalone vault file linked via `[[comments/c-…]]`, deliberately *not* anchored to a position ("every link points at a file, not a position inside one"). We are overturning that. Comments are now **anchored blocks inside a fragment's Margin** (`specifications/margins.md`): each comment is bound to a specific block of the fragment, not to a file, and is not a document-link.

## Why

The file-per-comment model gave uniform linking but could not express "this remark is about *this* passage" — the thing the writer actually wants when commenting on structure, a character beat, or a line to rewrite. Anchoring is the whole point of commenting; a model that forbids it solves the wrong problem. Co-locating a fragment's comments in one Margin document also gives the side-by-side reading/editing surface and the self-contained unit the eventual graph view needs.

## Trade-off accepted

- The anchor is carried by a **trailing block marker written into the fragment body** — Maskor now edits fragment prose as a side-effect of a user authoring a comment. This loosens (does not abandon) the `fragment-model.md` "never edits fragment content" constraint: the wording becomes "never edits fragment prose *except through user actions*; anchor markup written when the user authors a comment is a permitted, user-initiated edit." Maskor already rewrites fragment files for metadata backfill, so the constraint was never absolute.
- The marker must survive the editor round-trip in **both** modes (CM6/vim and TipTap), which requires a custom marker treatment in each editor (CM6 decoration to render it subtly and reveal raw-on-cursor; a TipTap node attribute + serializer). This is net-new editor work the file-based model would not have needed.
- Block-granular only for now; word/span-level anchoring is explicitly deferred (better suited to a word processor).

## Consequences for document-links.md

- Comments are removed from `document-links.md`'s future scope; this ADR + `margins.md` own them.
- Separately (and independently of comments), the fragment `notes:` attachment list is being dropped, so the spec's "inline `[[notes/foo]]` auto-adds to the fragment note list" rule no longer applies to notes. Notes become link-table/backlink citizens only. References and aspects keep their auto-sync behaviour.
