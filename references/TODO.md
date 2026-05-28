# TODO

Personal notes-to-self: meta and workflow items, exploratory product ideas not yet ready to spec, and reminders that don't fit the PRD or `specifications/_drafts.md`.

Product features and bugs go in `tasks/prd-small-improvements.md`. Future-spec stubs live in `specifications/_drafts.md`. Implementation plans for designed work go in `references/plans/`.

---

## Codebase

- [ ] fix lint errors

- [ ] finish remove piece plan (see worktree)

- [ ] finish persist cursor position implementation

- [x] Refactor command system, introduce strong types and reduce boilerplate

- [ ] notification/banner component for communicating result of actions

- [ ] Ctrl+k etc triggers BOTH quick-switcher AND the editor, triggering a vim cut action. This could result in accidentally deleting text without noticing. Make sure command system triggers first and prevents the events from reaching the editor.

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
  - also, possibly include with comment system.
  - goal: a way to write general notes, but also annotate text, point to specific parts
  - more granular than fragment? arrows that link to a section in the text? note-based, non-linear commenting/notation engine?
  - graph structure pointing to other fragments using inline links or comments/references?

- [ ] fragment-specific notes, viewing fragment and comments/notes side by side in same view

- [ ] sequences: auto-fill in order of fragments on import
- [ ] sequences: pool is unnecessarily wide, includes too much
- [ ] sequences: quick-add popup, add a fragment to a sequence, or the main sequence, actions for adding last, first, or select position. Accessible from editor

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
