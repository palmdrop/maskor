# TODO

Personal notes-to-self: meta and workflow items, exploratory product ideas not yet ready to spec, and reminders that don't fit the PRD or `specifications/_drafts.md`.

Product features and bugs go in `tasks/prd-small-improvements.md`. Future-spec stubs live in `specifications/_drafts.md`. Implementation plans for designed work go in `references/plans/`.

---

## Codebase

### Margins

- [x] margins panel should look more linear and sync and scroll with the fragment editor (margins-2 Phase 4: annotated-paragraphs column + scroll-sync)
- [x] margins panel should feel like an actual margin, scroll with the editor, aligh properly, etc (margins-2 Phase 4; pixel-exact padding/scroll-sync need a manual browser smoke — see suggestions.md)
- [x] deleting comments does not remove the anchor (margins-2 Phase 3: delete strips the marker)
- [x] anchors clutter the editing, and are easily broken (margins-2 Phase 1: always-hidden marker + dot cue + show-source toggle)
- [x] adding a new comment where there already is an anchor creates a double anchor (margins-2 Phase 3: one comment per block; gesture focuses existing)
- [x] the entire paragraph becomes the excerpt of a comment, not just a small excerpt (margins-2 Phase 2: excerpt is the capped block opening)
- [x] pressing escape or maybe enter should restore focus to editor again (margins-2 Phase 4: Escape returns the caret to the bound paragraph)
- [x] surprise in suggestions.md about frontmatter loss requires investigation (margins-2 Phase 6: extraFrontmatter round-trip for aspects/notes/refs)

### Rest

- [x] fix lint errors

- [x] finish remove piece plan (see worktree)

- [ ] sometimes on save after an edit, extra whitespace is removed and cursor position is updated, sometimes to bottom and sometimes to top. Probably a roundtrip issue, or a use-effect issue? After a save, if content is unchanged, is it necessary to update the content state of the editor?

- [ ] when adding an aspect, even when navigating to select an option, enter creates a new aspect, unless the full aspect name is inputted in the search field

- [ ] when re-loading a fragment from server, the banner indicating that its been edited, not saved, sticks and never goes away, even after a save.

- [ ] when navigating away from a suggestion, then back, sometimes the fragment BEFORE the previously viewed fragment is shown instead. Backend state is probably not updated properly?

- [ ] database schema changes still cause permanent db errors without the previously implemented database reset taking effect. See `@references/plans/dev-db-auto-reset.md`. Need to investigate.

- [ ] make it possible to "clone" a sequence, or insert one sequence into another, etc

- [ ] add way to select many fragments in sequence, way of making them into a section
  - way of easily dragging many into an existing section
  - way of marking a fragment, then "splitting" the sequence by introducing a new section at that location
  - NOTE: this logic needs to be robust, i.e not just frontend. Should live in the sequencer code.

- [ ] sequences: pool is unnecessarily wide, includes too much
- [x] sequences: quick-add popup, add a fragment to a sequence, or the main sequence, actions for adding last, first, or select position. Accessible from editor

- [x] when moving a fragment across sections with arrow keys, focus is lost, and the fragment has to be clicked again
- [x] reordering sections in sequence does not work properly with arrow keys, works when dragging and dropping
- [x] sequences: default "import-sequence" created for each import, serves as a snapshot of the initial import order
  - these should not be editable, no pool for adding new fragments

- [ ] start designing UI, see: https://www.are.na/anton-hildingsson/maskor-inspiration
  - want it aesthetic, minimal, graphlike, vague, generic, specific, all at once

- [ ] sticky fragment titles showing which fragment we are in during import/preview/export
  - even when fragment titles are hidden
  - redesign, make more minimal, closer to have a document actually looks

- [x] case-only rename of reference (and probably also note, aspect and fragment) creates a sync/naming collision error that ends up deleting the file entirely...

- [x] add commands for attaching and detaching references and notes to fragment

- [ ] in-line editing of fragments in preview mode
  - make it possible to click a fragment and edit it directly in the preview

- [ ] investigate/design graph view: dynamic frontend view where all pages/components/concepts can be viewed, side by side, connected
  - a fragment with connected notes and comments floating beside
  - a sequence with arcs as lines and entity documents
  - previews that can be focused, editing fragments in-line
  - zoom and focus different parts
  - connect entities with annotated graph links
  - fadeout surroundings when focusing a fragment/sequence for editing
  - show sidebars with action log, other views - make UI fully composable, customizable
  - define own flows, concepts, structures?

- [x] finish persist cursor position implementation

- [x] Refactor command system, introduce strong types and reduce boilerplate

- [ ] notification/banner component for communicating result of actions

- [x] Ctrl+k etc triggers BOTH quick-switcher AND the editor, triggering a vim cut action. This could result in accidentally deleting text without noticing. Make sure command system triggers first and prevents the events from reaching the editor.

- [ ] suggestion.currentFragmentUUID is state rather than config and should prob not be stored in project manifest. Investigate and move to a table instead

- [x] subfolders for organizing aspects/arcs
  - do not duplicate obsidian functionality... make this a companion app for obsidian, a layer above, not a replacement? at least for now.
  - focus on adding features that make the gap seamless

- [ ] edit counter seems off in suggestion mode. Should only count every session that results in a change, not every save

- [x] investigate code changes required for small schema/manifest changes: commit hash 32bb4fa8320c62d0c6e38b551b52982d536746e2
  - intermediate manifest types, schemas, types that could be inferred, etc

- [x] back button for suggestion mode
- [-] explicit search in suggestion mode

- [ ] find a way to automatically create em-dashes etc

- [x] italics and such flickers in editor when editing in vim/raw mode...

- [x] use command system to trigger quick-switcher and command palette too instead of custom keybind handlers in components

- [ ] rework note system -- side by side view of note + fragment should be available
  - goal: a way to write general notes, but also annotate text, point to specific parts
  - also, possibly include with comment system.
  - attach part of note to specific line/word(s). One long note with expandable-retractable comment lines, combined note + comment view?
  - more granular than fragment? arrows that link to a section in the text? note-based, non-linear commenting/notation engine?
  - graph structure pointing to other fragments using inline links or comments/references?

- [ ] fragment-specific notes, viewing fragment and comments/notes side by side in same view

- [ ] extract in suggestion, how should that work?

- [x] editor loses focus after command palette is opened and closed again
  - make modals (command palette, quick-switcher) set context state that indicate if they are open or not. Let editor request focus restoration when modal closes (iff editor was focused before modal opened).
  - another option: create a focus manager that records focus before opening modal, then restores it to the relevant element when modal closes

- [x] specs claim command palette and quick-switcher use the same underlying picker component, but neither does. Instead, they define their own logic. There is a picker component, but it is never used in the code (except for test).

- [ ] add project-wide setting for yanking to clipboard or not in vim mode

- [ ] investigate spelling, language settings

## Workflow / tooling

- [ ] add claude browser MCP server and skill for testing manually in browser

- [ ] try the "improve codebase architecture" skill: https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md

- [x] introduce commits and branches in the old (non-ralph) plan flow, and make sure the implementing agent always updates the relevant spec's `Shipped:` log

- [ ] place frontend components in appropriate subfolders — right now, everything is on root level in `packages/frontend/src/components/`

- [ ] investigate logger — is the current pattern good? where to see logs? how to write intentional logs worth reading?

- [ ] find a flow for using cheaper models for appropriate tasks — queue up tasks to a good-but-slow model on the home desktop and see if results are sufficient

---

## Exploratory product notes (not yet ready to spec)

- [ ] typography rule for using indentation instead of newlines as paragraph separator — conflicts with markdown syntax but might work out anyway, needs a real exploration conversation

- [ ] obsidian-plugin angle — port Maskor (or part of it) to an Obsidian plugin while keeping the standalone app? side thought from the mermaid draft

- [ ] trash folder for aspects / notes / refs instead of hard-delete — spec'd in `specifications/attachments.md`, but worth revisiting once it's been in use (retention policy, restore UX, etc.)
