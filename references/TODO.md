# TODO

Personal notes-to-self: meta and workflow items, exploratory product ideas not yet ready to spec, and reminders that don't fit the PRD or `specifications/_drafts.md`.

Product features and bugs go in `tasks/prd-small-improvements.md`. Future-spec stubs live in `specifications/_drafts.md`. Implementation plans for designed work go in `references/plans/`.

---

## Codebase
- [ ] investigate obsidian plugin replacement for features of maskor, for example, update obsidian-port spec accordingly 
    - https://forum.obsidian.md/t/plugin-storyline-obsidian-plugin-for-writers/111494 (NOTE: This may cover most of maskor?)
    - https://community.obsidian.md/plugins/document-comments
    - and https://www.youtube.com/watch?v=BTuGvfQGOrY
    - https://traditionkeeper8.gumroad.com/l/asystemforwriting
    - (INVESTIGATED 2026-07-15: full coverage map + hybrid install model drafted in `specifications/obsidian-port.md`. Document Comments anchors comments with the same `<!--c:ID-->` markers as the Margin (ADR 0009) — adopt-first candidate. YouTube link not assessed.)

- [x] split-into sequence feature: when splitting a fragment, it should be possible to add the fragments, in order, to a new sequence. This is to preserve their order, and possibly add them as a constraint for other sequences. (SHIPPED 2026-07-14: opt-in "Add pieces to a new sequence" in the split dialog creates a plain active secondary sequence holding the pieces in split order — plan: `references/plans/split-into-sequence.md`)

- [x] footnotes in export based on references on fragments (DONE 2026-07-12: references render as footnotes — GFM in `.md`/`.txt`, real Word footnotes in `.docx` — anchored at the end of each attaching fragment, one deduped definition per reference; per-project `export.includeReferences` toggle (default on) with per-export override in the Export dialog — plan: `references/plans/export-enhancements.md`)

- [x] comments in export, from margin? (DONE 2026-07-12: Margin comments + notes export as GFM footnotes in `.md`/`.txt` and Word comments in `.docx` (comments span their anchored paragraph; notes anchor to the title/first block); orphaned comments skipped with a warning toast; `export.includeMarginAnnotations` toggle (default on) — plan: `references/plans/export-enhancements.md`)

- [x] loosing work still happens somehow... usually when I continue from an existing session in a tab... (FIXED 2026-07-10: stale-tab vectors closed — swap writes carry a baseline fingerprint of the content the buffer diverged from; conflicting backups need an explicit keep-server/restore choice instead of silent auto-apply; a linked fragment↔Margin pair is held back atomically while either side conflicts — plan: `references/plans/multi-tab-swap-hardening.md` + review `references/reviews/fixes-batch-2026-07-10.md`, on `agent/fixes`)
  - Original report: when returning to maskor after my computer has been suspended, it fails to save work, with no visual indication for the user. Flow: I return to a maskor-tab in my browser. I make some edits to the current file. I save. Everything looks fine. But when I change fragment, or refresh, all work that session has been lost. This consistently happen after I have suspended my computer, then returned to an already opened tab. Refreshing before making any edits avoids the problem.

- [x] sometimes, when a fragment is refetched, a comment is temporarily orphaned. I changed the readiness slider and the comment lost its anchor. On refresh, it was back. (FIXED 2026-07-10: the column reuses the last non-empty block list while a reload transiently empties it, so bound comments never flicker to the orphan group; genuine marker deletion still demotes — plan: `references/plans/margin-orphan-and-notes-tab.md`)

- [x] document links are sometimes broken. I split a document, added a document link, but then, that link pointed to the next fragment in the sequence, NOT the actually linked fragment (INVESTIGATED 2026-07-10: no reproducible defect remains — split key derivation guarantees distinct keys, the picker and resolver share one snapshot, and the split dialog invalidates the fragment list (stale window closed by the discard-and-split-integrity work). Invariants pinned by regression tests — plan: `references/plans/document-links-polish.md`)

- [x] comments close to the bottom notes tab are offset on creation, then hidden behind tab... need to move the general notes tab, maybe behind a third tab beside margins/aspect on the right panel (FIXED 2026-07-10: general notes moved to a third gutter tab (`MarginNotesTab`); the column footer now only holds orphans + controls, so nothing covers or offsets bottom comments — plan: `references/plans/margin-orphan-and-notes-tab.md`)

- [x] discarding a fragment in a sequence does not remove it in the frontend. Using the remove from sequence command fails, because in the backend, the fragment is probably already removed - the frontend cache was never updated (FIXED 2026-07-10: discard now removes the fragment from sequences server-side and the frontend invalidates the sequence query family; restore returns the fragment to the pool without re-placing; import-sequences keep placements as frozen snapshots. Underlying `fragment_positions` FK-cascade wart noted in `references/suggestions.md` — plan: `references/plans/discard-and-split-integrity.md`)

- [x] fragment split still "fails", but actually succeeds (FIXED 2026-07-10: split restructured into validate → core writes → placement/margin phase; post-commit failures now surface as per-item warnings instead of a bogus 500; key conflicts reject before any write — plan: `references/plans/discard-and-split-integrity.md`)

- [x] tabbing when selecting link should auto-complete (atm, just enter works) (FIXED 2026-07-10: Tab accepts the `[[` autocomplete in rich, raw, and vim modes — plan: `references/plans/document-links-polish.md`)


- [x] Ended up losing a lot of work when save didn't work as expected AND there was no swap file. Maskor was in a strange state and I got no indication. If swap file creation fails, frontend should know and warn the user. If save does not succeed, user needs to know so they can copy their work and not lose it. (in progress — plan: `references/plans/never-lose-writing.md`. Root cause found: a stuck load guard silently killed the editor's change chain, disengaging save+swap+buffer-authority at once. Fixed: crash-safe load guards (Phase 1), a dirty backstop (Phase 2), and a non-dismissable "not backed up" banner when a swap write fails (Phase 3). Split desync = Phase 6.)

- [x] When doing an edit to a fragment, then prompting a split, split sometimes claim to fail, but actually succeeds. Probably has to do with swap/saved state not being committed properly, i.e server and frontend being out of sync? (Fixed: **Split fragment** now saves the open fragment before opening the dialog, so the split reads fresh vault content instead of the pre-edit version — plan `references/plans/never-lose-writing.md`, Phase 6.)

- [x] Add fragment links in comments! (DONE 2026-07-10: comment + general-notes editors get `[[` autocomplete in all modes; static comment/notes text renders resolved/broken links with click-to-navigate. Comments are link readers only — no backlinks/link-table sources, recorded as an open question in `specifications/document-links.md` — plan: `references/plans/document-links-polish.md`)

- [ ] Quick-switching (cmd+tab?) between fragments etc?

- [x] In rich mode, add a button for adding a link (DONE 2026-07-10: toolbar Link button opens the palette aimed at `editor:insert-link`'s entity picker — plan: `references/plans/document-links-polish.md`)

- [x] Margins: if a comment is longer than the block, BUT there is no comments below, let it expand over other blocks. IF there are other comments, then only show the part of the comment that fits. HOWEVER: might be a good idea to add a scrollbar, so it is clear that there is more, and so that the user can scroll inside the comment without having to click it (which also prompts editing). (clip now stops at the next comment, not the paragraph; free extension when none below; thin always-visible scrollbar on overflow — plan: `references/plans/margins-overflow.md`)

- [ ] Need to make it easier to manage and overview aspects. Should be possible to inspect aspect folder structure, and move between them while reading the contents (similar to obsidian, or just the fragment list). Also, should have an indication showing how many fragments are attached to the aspect. Finally, a way of reading aspect content while in a fragment? tabbed view? idk

- [ ] When I expand the sequencer, suggestion engine, interleavmenet, etc, maybe add "template fragments" that adhere to the desired shape, and can be filled with specific content 

- [x] BIG ISSUE: when having maskor opened in multiple tabs, cache is sometimes overwritten? a change in one tab, in an unrelated document, might cause the dirty document in the other tab to be restored to the pre-edit state. A refresh will re-surface the edits from the server swap file... not sure why this happens.
  - NOTE: sometimes happens when only one maskor-instance is opened. It is enough to navigate between different fragments, and then back to the one that was edited.
  - FIXED 2026-06-17: root cause was `ProseEditor` overwriting the dirty buffer whenever its `content` prop refreshed (no `isDirty` guard), amplified by `useVaultEvents` invalidating every project query on any vault event. The buffer is now authoritative while dirty, and live-update invalidation is scoped per entity. (swap recovery on simple navigate-back already worked — verified.) See `specifications/fragment-editor.md` (Buffer authority).

- [x] Renaming a fragment using the inline editor on the overview page does not update the fragment title in the sequence sidebar (FIXED 2026-06-17: the rename now invalidates the fragment summaries list, which backs the Overview's left column + spine. A rename emits no `fragment:synced` SSE event — the key is the filename, not part of the watcher's content hash — so the invalidation has to come from the update mutation.)

- [ ] Use actual browser tabs as the tab implementation somehow

- [x] When splitting, it should be possible to rename fragments in the modal before committing (new pieces 2…N render as editable key inputs; piece 1 keeps the original's key; server validates `pieceKeys` overrides)
- [x] Smart splitting auto-select - if a fragment has headlines, split on that, if it has page breaks, split on that, etc... (but never default to newline?) (server-side `detectSplitDelimiter`: shallowest splitting heading level → thematic break; never blank-line; seeds the dialog on open)

- [x] Ability to create and add reference from the modal, without navigating away (fragment metadata reference combobox now has create-and-attach, mirroring aspects)

- [x] Ability to add a fragment to a sequence on creation - and, if in fragment list view, if sorting on a sequence, have that sequence pre-selected for addition (New-fragment dialog has an optional "Add to sequence" picker, pre-selecting the list's current sort sequence; appends to the sequence's last section; import-sequences excluded)

- [x] Splitting on "---" caused "split failed", however, the split did succeed (post-split cache-refresh failure was caught as a split failure; mutation and invalidations now decoupled)

- [ ] make it possible to highlight a sequence in another sequence

- [x] show a dot or indicator on fragments that have unsaved changes (amber dot for fragments with a swap file, via new `GET /swap` list endpoint — in the fragment list and the Overview reorder column; could still extend to the sequence sidebar)

- [ ] still a flicker on refresh in overview on scroll
  - INVESTIGATED (2026-06-18): root cause is the one-frame flash from scroll restoration. The spine renders one async-mounting Tiptap (`ReadonlyProse`) per fragment, so the spine height grows over several frames after `spineContentReady`; the single `requestAnimationFrame` scroll restore in `OverviewPage/index.tsx` fires after the first paint (at scrollTop 0) and then jumps to the remembered offset. Fix needs in-browser verification (e.g. hold the spine hidden until restore applied, or gate restore on a stable-height signal) and touches the delicate `resolveOverviewLoadScroll` / anchor-reconciliation path — deferred rather than guess-patched.

- [x] when using command system to place a fragment in a sequence, the sequences it is already in should be on the top, and there should be an indication so that user knows they can move the fragment in the sequence (member sequences float to top, labelled with their section; move-ability now conveyed by the modal's drag UI — plan: `references/plans/sequence-placement-improvements.md`)

- [x] fragment splitter - make it possible to split an existing fragment into multiple by adding delimiters and then running a split command. Could be headlines, line breaks, or "---"

- [x] sequence placement command should be more slimmed and have drag and drop, a mini version of the actual overview page (now the `SequenceArranger`: reuses the Overview left-column look with full drag-and-drop; ADR 0014 supersedes ADR 0006. All rows are draggable — the original "active-only" caveat was relaxed deliberately. plan: `references/plans/sequence-placement-improvements.md`)
  - ~~IFF it is possible to do that without enabling drag/drop for all fragments in the sequence~~

- [x] import sequences should not be visible in the sequence placement modal (filtered from the picker; import-sequences are also read-only everywhere — plan: `references/plans/sequence-placement-improvements.md`)

- [ ] auto-link aspects when the word is written in the editor! also highlight and add preview!
  - make it possible to disable auto-linking for specific aspects

- [ ] full-text fuzzy search in all entities

- [x] investigate focus view, i.e editing a single fragment without rest of the view visible. COuld be used as a replacement for the in-place edits that occur in overview and previt ew

- [x] extra newlines on top of a fragment does not correctly offset the margins alignment - margins are not offset

- [x] sometimes on save after an edit, extra whitespace is removed and cursor position is updated, sometimes to bottom and sometimes to top. Probably a roundtrip issue, or a use-effect issue? After a save, if content is unchanged, is it necessary to update the content state of the editor?

- [x] when adding an aspect, even when navigating to select an option, enter creates a new aspect, unless the full aspect name is inputted in the search field

- [x] when navigating away from a suggestion, then back, sometimes the fragment BEFORE the previously viewed fragment is shown instead. Backend state is probably not updated properly?

- [x] sticky fragment titles showing which fragment we are in during import/preview/export (shared `ActiveFragmentLabel` in the sticky header of preview + import, driven by the scroll-spy; shown regardless of the titles toggle. "export" = the preview-before-export surface, already covered.)
  - [x] even when fragment titles are hidden
  - [x] redesign, make more minimal, closer to how a document actually looks (muted, icon + truncated key, reads as a location cue not a control — further aesthetic iteration left to the broader UI design pass, TODO line ~86)

- [x] database schema changes still cause permanent db errors without the previously implemented database reset taking effect. See `@references/plans/dev-db-auto-reset.md`. Need to investigate.
  - ROOT CAUSE (2026-06-18): the auto-reset logic works (verified empirically), but `MASKOR_DB_AUTO_RESET` was undocumented and there is no `.env`, so `isAutoResetEnabled()` was always false — the reset never fired. FIXED: the API `dev` script now sets `MASKOR_DB_AUTO_RESET=1` inline, so `bun run dev` auto-resets on a migration-set change with no setup (never under the packaged `start`). Fires on the next restart after the migration set changes — under `bun --watch`, saving the imported `schema.ts` triggers that restart. Added regression tests for the real trigger (migration add/amend). See the suggestions.md entry for a secondary wart (every new migration triggers a full reset+rebuild, discarding `fragment_stats` telemetry).

- [x] make it possible to "clone" a sequence, or insert one sequence into another, etc

- [x] investigate spelling, language settings (DONE 2026-07-01: project-wide + per-fragment writing language with native browser spell-check behind the SpellProvider seam — plan: `references/plans/language-spelling.md`, merged as 607c013)

- [x] add way to select many fragments in sequence, way of making them into a section
  - way of easily dragging many into an existing section
  - way of marking a fragment, then "splitting" the sequence by introducing a new section at that location
  - NOTE: this logic needs to be robust, i.e not just frontend. Should live in the sequencer code.

- [x] sequences: pool is unnecessarily wide, includes too much
- [x] sequences: quick-add popup, add a fragment to a sequence, or the main sequence, actions for adding last, first, or select position. Accessible from editor

- [x] when moving a fragment across sections with arrow keys, focus is lost, and the fragment has to be clicked again
- [x] reordering sections in sequence does not work properly with arrow keys, works when dragging and dropping
- [x] sequences: default "import-sequence" created for each import, serves as a snapshot of the initial import order
  - these should not be editable, no pool for adding new fragments

- [ ] start designing UI, see: https://www.are.na/anton-hildingsson/maskor-inspiration
  - want it aesthetic, minimal, graphlike, vague, generic, specific, all at once

- [x] case-only rename of reference (and probably also note, aspect and fragment) creates a sync/naming collision error that ends up deleting the file entirely...

- [x] add commands for attaching and detaching references and notes to fragment

- [x] in-line editing of fragments in preview mode
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
  - TODO: consider rebuilding maskor as an obsidian plugin, where the graph view and sequencing and randomiser are obsidian addons, rather than a complete app? (investigated 2026-07-05; graduated 2026-07-15 to `specifications/obsidian-port.md`. Resolution: this graph-view vision becomes a bespoke composable canvas `ItemView` in `maskor-core` — sequence lanes, arc overlay, edit/compare; native Canvas serves only as a generated projection target, its internals are never patched)

- [x] finish persist cursor position implementation

- [x] Refactor command system, introduce strong types and reduce boilerplate

- [x] notification/banner component for communicating result of actions

- [x] Ctrl+k etc triggers BOTH quick-switcher AND the editor, triggering a vim cut action. This could result in accidentally deleting text without noticing. Make sure command system triggers first and prevents the events from reaching the editor.

- [x] suggestion.currentFragmentUUID is state rather than config and should prob not be stored in project manifest. Investigate and move to a table instead

- [x] subfolders for organizing aspects/arcs
  - do not duplicate obsidian functionality... make this a companion app for obsidian, a layer above, not a replacement? at least for now.
  - focus on adding features that make the gap seamless

- [x] edit counter seems off in suggestion mode. Should only count every session that results in a change, not every save

- [x] investigate code changes required for small schema/manifest changes: commit hash 32bb4fa8320c62d0c6e38b551b52982d536746e2
  - intermediate manifest types, schemas, types that could be inferred, etc

- [x] back button for suggestion mode
- [-] explicit search in suggestion mode

- [x] find a way to automatically create em-dashes etc

- [x] italics and such flickers in editor when editing in vim/raw mode...

- [x] use command system to trigger quick-switcher and command palette too instead of custom keybind handlers in components

- [x] rework note system -- side by side view of note + fragment should be available
  - goal: a way to write general notes, but also annotate text, point to specific parts
  - also, possibly include with comment system.
  - attach part of note to specific line/word(s). One long note with expandable-retractable comment lines, combined note + comment view?
  - more granular than fragment? arrows that link to a section in the text? note-based, non-linear commenting/notation engine?
  - graph structure pointing to other fragments using inline links or comments/references?

- [x] fragment-specific notes, viewing fragment and comments/notes side by side in same view

- [ ] extract in suggestion, how should that work?

- [x] editor loses focus after command palette is opened and closed again
  - make modals (command palette, quick-switcher) set context state that indicate if they are open or not. Let editor request focus restoration when modal closes (iff editor was focused before modal opened).
  - another option: create a focus manager that records focus before opening modal, then restores it to the relevant element when modal closes

- [x] specs claim command palette and quick-switcher use the same underlying picker component, but neither does. Instead, they define their own logic. There is a picker component, but it is never used in the code (except for test).

- [x] add project-wide setting for yanking to clipboard or not in vim mode

## Workflow / tooling

- [ ] Add ability to push, make PRs, AND MOST IMPORTANTLY, listen for comments on PRs and react accordingly
  - review could be from me or another agent
- [ ] Listen to "issues" created, pick them up, run a loop, make a plan, etc, then wait for review

- [ ] Add way of automatically continuing a session when the usage limits resets 

- [ ] add claude browser MCP server and skill for testing manually in browser
  - important: ability to screenshot views, try different user flows, get direct feedback

- [ ] try the "improve codebase architecture" skill: https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md

- [x] introduce commits and branches in the old (non-ralph) plan flow, and make sure the implementing agent always updates the relevant spec's `Shipped:` log

- [ ] place frontend components in appropriate subfolders — right now, everything is on root level in `packages/frontend/src/components/`

- [ ] investigate logger — is the current pattern good? where to see logs? how to write intentional logs worth reading?

- [ ] find a flow for using cheaper models for appropriate tasks — queue up tasks to a good-but-slow model on the home desktop and see if results are sufficient

---

## Exploratory product notes (not yet ready to spec)

- [ ] typography rule for using indentation instead of newlines as paragraph separator — conflicts with markdown syntax but might work out anyway, needs a real exploration conversation

- [x] obsidian-plugin angle — port Maskor (or part of it) to an Obsidian plugin while keeping the standalone app? side thought from the mermaid draft. Investigated 2026-07-05 — verdict: feasible, core packages port cleanly, storage/API layer gets replaced by Vault + MetadataCache. Graduated 2026-07-15 to `specifications/obsidian-port.md` (full coverage map, hybrid vault-template + vault-doctor install model, capability gaps)

- [ ] trash folder for aspects / notes / refs instead of hard-delete — spec'd in `specifications/attachments.md`, but worth revisiting once it's been in use (retention policy, restore UX, etc.)

- [ ] Obsidian-style `%%…%%` inline comments — explored on `agent/obsidian-comments` (plan + `specifications/obsidian-comments.md` + `obsidian-comment.*` impl), **abandoned 2026-06-23** during repo cleanup; never merged to main. Recoverable from the `maskor-branches-*.bundle` backup if revisited.
