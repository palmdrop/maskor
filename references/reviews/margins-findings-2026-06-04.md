# Issues found with current margins implementation

See `specifications/margins.md`, `references/plans/margins.md` and `references/plans/margins-2.md`.

**All addressed in `references/plans/margins-4.md` (Done 2026-06-04).** Real-editor geometry/caret items carry a manual browser smoke (see `references/suggestions.md`).

- [FIXED — Phase 1] Wrong font in margins, should match editor serif font.
- [FIXED — Phase 1] Synced scrolling seems to work, but multi-line comments sometimes offsets alignment, probably due to a mismatch in vertical space of the two different fonts. _(serif family + matching line-height; residual drift is a manual smoke item.)_
- [FIXED — Phase 2] Sticky general note at the top offsets entire document. I now dislike this. Lets put it at the bottom of the document for now, only visible when scrolling all the way past the fragment text.
- [FIXED — Phase 2] Margin column controls (buttons for adding comment, expanding all, saving) also force the document to offset. Lets align everything to the top of the editor, no initial vertical offset in the fragment editor. Margin controls can go on the bottom of the margins column instead for now.
- [FIXED — Phase 5] Adding a comment seems to reload the comment box when the first character is inputted. When starting to write in vim mode, the first character is added, then the comment reloads, offsets slightly, and the user is brought back to normal mode in vim. _(unified slot editor keyed by block index; vim-mode-preserved confirmed by manual smoke.)_
- [FIXED — Phase 6] Fragment paragraph padding is adapted in a strange way when typing in a comment. It grows for each character, then stops at a certain point. When focus leaves the comment box, the layout shifts to match the actual height. _(document-side spacers freeze on focus, reconcile on blur.)_
- [FIXED — Phase 7] Deleting a paragraph and pasting it again does not re-attach the orphaned comment. Re-attachment using paragraph text does not seem to work. _(deletion now drops the anchor instead of collapsing it; orphan + fuzzy rebind path runs.)_
- [FIXED — Phase 3] Comments have left padding and a border that try to indicate where the comment stops and start. That should be removed. Instead, lets add a horisontal line that indicates to which paragraph the comment is attached. _(top attachment rule.)_
- [FIXED — Phase 3] General styling: the margin should be a seamless scroll of text, only when editing should a faint border indicate that the comment is a box. Fragment and margin should look like two seamless pieces of text with padding and a faint border as separator.
- [FIXED — Phase 4] Save button is not necessary in margins column: editor save should save fragment + margin together.
