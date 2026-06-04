# Issues found with current margins implementation
See `specifications/margins.md`, `references/plans/margins.md` and `references/plans/margins-2.md`.

- Wrong font in margins, should match editor serif font.
- Synced scrolling seems to work, but multi-line comments sometimes offsets alignment, probably due to a mismatch in vertical space of the two different fonts.
- Sticky general note at the top offsets entire document. I now dislike this. Lets put it at the bottom of the document for now, only visible when scrolling all the way past the fragment text.
- Margin column controls (buttons for adding comment, expanding all, saving) also force the document to offset. Lets align everything to the top of the editor, no initial vertical offset in the fragment editor. Margin controls can go on the bottom of the margins column instead for now.
- Adding a comment seems to reload the comment box when the first character is inputted. When starting to write in vim mode, the first character is added, then the comment reloads, offsets slightly, and the user is brought back to normal mode in vim.
- Fragment paragraph padding is adapted in a strange way when typing in a comment. It grows for each character, then stops at a certain point. When focus leaves the comment box, the layout shifts to match the actual height.
- Deleting a paragraph and pasting it again does not re-attach the orphaned comment. Re-attachment using paragraph text does not seem to work. 
- Comments have left padding and a border that try to indicate where the comment stops and start. That should be removed. Instead, lets add a horisontal line that indicates to which paragraph the comment is attached. 
- General styling: the margin should be a seamless scroll of text, only when editing should a faint border indicate that the comment is a box. Fragment and margin should look like two seamless pieces of text with padding and a faint border as separator.
- Save button is not necessary in margins column: editor save should save fragment + margin together. 
