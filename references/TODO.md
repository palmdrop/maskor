# TODO

Personal notes-to-self: meta and workflow items, exploratory product ideas not yet ready to spec, and reminders that don't fit the PRD or `specifications/_drafts.md`.

Product features and bugs go in `tasks/prd-small-improvements.md`. Future-spec stubs live in `specifications/_drafts.md`. Implementation plans for designed work go in `references/plans/`.

---

## Codebase

- [ ] Refactor command system, introduce strong types and reduce boilerplate

- [ ] notification/banner component for communicating result of actions

- [ ] subfolders for organizing aspects/arcs
  - do not duplicate obsidian functionality... make this a companion app for obsidian, a layer above, not a replacement? at least for now.
  - focus on adding features that make the gap seamless

- [ ] edit counter seems off in suggestion mode. Should only count every session that results in a change, not every save

- [ ] investigate code changes required for small schema/manifest changes: commit hash 32bb4fa8320c62d0c6e38b551b52982d536746e2
  - intermediate manifest types, schemas, types that could be inferred, etc

- [ ] back button for suggestion mode
- [ ] explicit search in suggestion mode

- [ ] extract in suggestion, how should that work?

- [ ] investigate spelling, language settings

- [ ] fragment-specific notes, viewing fragment and comments/notes side by side in same view

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
