# PRD: Secondary Sequences

## Introduction

Allow a Maskor project to hold multiple sequences. Exactly one sequence is designated as the **main** sequence (the export target). All other sequences are **secondaries** — real fragment arrangements in their own right that also _project their internal order as soft pairwise ordering constraints onto the main sequence_. Violations of those constraints are surfaced as visual indicators in the UI; they do not block manual placement.

A fragment can appear in any number of sequences but at most once per sequence. Each sequence has its own independent unassigned pool, sections, and ordering. This is slice 2 of the sequencer feature; slice 1 (single-main manual placement) is already shipped (`2026-05-12`).

The motivating use case is treating secondaries as parallel storylines or thematic chains the writer is outlining alongside the main manuscript. If a secondary called "Sarah's arc" lays out fragments as A → D → F, then anywhere in the main where those fragments are placed, the same relative order should hold (with arbitrary gaps allowed). When it doesn't, the main view shows the user where and why.

Slice 2 also makes **sections** a first-class UI concept. Until now sections existed in the data model but the UI rendered only `sections[0]` of the main sequence. This slice adds create/rename/delete commands and the matching section-aware editing pane so secondaries can be used as multi-section outlines.

**Source Specifications:**

- `specifications/sequencer.md`
- `specifications/vision.md`

## Goals

- Support N ≥ 1 sequences per project, with exactly one designated as `isMain`.
- Let fragments live in multiple sequences simultaneously, once per sequence, independently.
- Project every non-main sequence's internal order onto main as a soft subsequence-relation constraint.
- Surface violations as per-fragment warning glyphs on the main view, with hover tooltips.
- Detect (but do not prevent) cycles across secondaries and surface them as a distinct, more severe class of warning.
- Provide a left sidebar with all sequences and a persistent right sidebar that doubles as fragment detail panel and project warnings panel.
- Expose sections as user-managed containers (create / rename / delete) within every sequence.
- Persist active-sequence selection in the URL via a query param.
- Zero changes to vault file format or DB schema; the existing structures already accommodate the feature.

## User Stories

### US-001: Sequencer — flat-order primitive

**Description:** As a backend developer, I need a function that produces the flat ordered list of fragment UUIDs for any sequence so that downstream constraint and violation logic has a single source of truth for sequence order.

**Acceptance Criteria:**

- [ ] `getFragmentOrder(sequence: Sequence): string[]` added to `@maskor/sequencer`
- [ ] Flat order = sections sorted by section position, then fragments sorted by fragment position within each section
- [ ] Pure function, no side effects
- [ ] Unit tests cover: empty sequence, single section with fragments, multi-section ordering, section with zero fragments interspersed
- [ ] Typecheck passes

### US-002: Sequencer — violation computation

**Description:** As a backend developer, I need a function that returns all soft-constraint violations of the main sequence given the secondaries, so the API can return live warnings.

**Acceptance Criteria:**

- [ ] `computeViolations(main: Sequence, secondaries: Sequence[]): Violation[]` added to `@maskor/sequencer`
- [ ] `Violation` type = `{ fragmentUuid: string; predecessorUuid: string; secondaryUuid: string }`
- [ ] Constraint semantics: subsequence relation with gaps allowed — if A precedes B in a secondary and both are placed in main, A must precede B in main
- [ ] Violations are computed only when both endpoints are placed in main
- [ ] Secondaries that participate in a cycle (per US-003) are skipped entirely
- [ ] Unit tests cover: no violations, single violation, multiple violations on one fragment, fragment in multiple secondaries, only-one-endpoint-placed (no violation), cycle-skip behavior
- [ ] Typecheck passes

### US-003: Sequencer — cycle detection

**Description:** As a backend developer, I need a function that finds non-trivial strongly-connected components across the union graph of all secondary ordering constraints, so cycles can be surfaced separately from violations.

**Acceptance Criteria:**

- [ ] `detectCycles(secondaries: Sequence[]): Cycle[]` added to `@maskor/sequencer`
- [ ] `Cycle` type = `{ sequenceUuids: string[]; fragmentUuids: string[] }` — the SCC and the secondaries whose edges contribute to it
- [ ] Edges built from each secondary's pairwise constraints (all (A, B) where A precedes B in that secondary's flat order)
- [ ] Trivial SCCs (single nodes) are not reported
- [ ] Unit tests cover: no cycles, single 2-node cycle across two secondaries, 3-node cycle, multiple independent cycles
- [ ] Typecheck passes

### US-004: Sequence command — name uniqueness validation

**Description:** As a user, I want to be prevented from creating or renaming a sequence to a name that already exists in the project so the sidebar list remains unambiguous.

**Acceptance Criteria:**

- [ ] `create-sequence` rejects with a clear typed error if the proposed name collides (case-sensitive comparison within the project)
- [ ] `update-sequence` rejects rename to a colliding name (the sequence's own current name is allowed)
- [ ] Error surfaces a structured code/message that the frontend can render inline
- [ ] Integration test: create two sequences with the same name fails the second creation
- [ ] Integration test: rename to an existing name fails; rename to the sequence's own name succeeds
- [ ] Typecheck passes

### US-005: Sequence command — designate as main

**Description:** As a user, I want to make a secondary into the main sequence so I can change which sequence is the export target.

**Acceptance Criteria:**

- [ ] New API command `designate-sequence-main` that takes a sequence UUID
- [ ] The flip is atomic: in a single transaction, the previous main becomes `isMain: false` and the target becomes `isMain: true`
- [ ] Vault files for both affected sequences are rewritten on success
- [ ] Partial unique index on `sequences.is_main` is not violated at any point during the transaction
- [ ] Returns the bundled response shape (US-007)
- [ ] Integration test: flipping main from A to B sets B as main and A as secondary; running it again with B has no effect; running it with a non-existent UUID errors
- [ ] Typecheck passes

### US-006: Sequence command — guard main deletion

**Description:** As a user, I want to be prevented from deleting the main sequence so I cannot accidentally lose the export target without explicit intent.

**Acceptance Criteria:**

- [ ] `delete-sequence` rejects with a typed error when the target is `isMain: true`
- [ ] Error surfaces a structured code the frontend can render inline ("Designate another sequence as main first")
- [ ] Non-main deletion still works and cascades cleanly: the vault file is removed, DB rows for the sequence, its sections, and its fragment_positions are deleted (existing cascade)
- [ ] Fragments remain in the project after their containing secondary is deleted (they are not orphaned in any other sequence they belong to)
- [ ] Integration test: deleting main rejects; deleting non-main succeeds and other sequences are unaffected
- [ ] Typecheck passes

### US-007: API — bundled sequence list response

**Description:** As a frontend developer, I want the project's sequences, current violations, and current cycles all in one payload so the UI is a pure consumer with no orchestration logic.

**Acceptance Criteria:**

- [ ] `GET /api/projects/:projectUuid/sequences` returns `{ sequences: Sequence[]; violations: Violation[]; cycles: Cycle[] }`
- [ ] All mutating commands (create-sequence, update-sequence, delete-sequence, designate-sequence-main, place-fragment, move-fragment, unplace-fragment, **create-section, rename-section, delete-section**) return the same bundled shape
- [ ] Violations and cycles are computed live on every request via the sequencer package, not cached
- [ ] `Violation` and `Cycle` types are exported from `@maskor/shared` for frontend consumption
- [ ] Integration test: create a secondary with a constraint, place fragments out of order in main, fetch — response includes the expected violation
- [ ] Integration test: create two secondaries with conflicting orders — response includes the expected cycle and excludes per-fragment violations from those secondaries
- [ ] Typecheck passes

### US-008: Section command — create section

**Description:** As a user, I want to add a new section to a sequence so I can organize fragments into named groups.

**Acceptance Criteria:**

- [ ] New API command `create-section` taking `{ sequenceId, name }`
- [ ] New section is appended at the highest existing section position + 1 within the sequence
- [ ] Vault file for the sequence is rewritten on success
- [ ] Returns the bundled response shape (US-007)
- [ ] Integration test: creating a section in any sequence (main or secondary) appends it after existing sections
- [ ] Integration test: a sequence with a freshly-created section can accept fragment placements into it
- [ ] Typecheck passes

### US-009: Section command — rename section

**Description:** As a user, I want to rename a section so I can label organizational groupings meaningfully.

**Acceptance Criteria:**

- [ ] New API command `rename-section` taking `{ sequenceId, sectionId, name }`
- [ ] Name may be any string including the empty string (intentional — new sections can stay unnamed until renamed)
- [ ] No uniqueness constraint on section names within a sequence (two sections may share the same name; they are still distinguished by UUID)
- [ ] Vault file is rewritten on success
- [ ] Returns the bundled response shape (US-007)
- [ ] Integration test: renaming an existing section updates the vault and the API response
- [ ] Typecheck passes

### US-010: Section command — delete section

**Description:** As a user, I want to delete a section, with its placed fragments returning to the sequence's unassigned pool rather than being lost.

**Acceptance Criteria:**

- [ ] New API command `delete-section` taking `{ sequenceId, sectionId }`
- [ ] Deletion is rejected with a typed error if the target is the **last remaining section** in the sequence (every sequence must have at least one section)
- [ ] Deletion is rejected with a typed error if the target sequence does not contain the section
- [ ] On success: all `fragment_positions` rows under the section are removed; the fragments themselves remain in the project (they appear in this sequence's pool again on next read)
- [ ] Remaining sections are compacted: their `position` values are renumbered to 0..N-1 to remove the gap
- [ ] Vault file is rewritten on success
- [ ] Returns the bundled response shape (US-007)
- [ ] Integration test: deleting a non-empty section unplaces its fragments to the pool; remaining sections renumber correctly; deleting the only remaining section errors
- [ ] Typecheck passes

### US-011: Frontend — sequence selection via URL query param

**Description:** As a user, I want the active sequence to be reflected in the URL so I can bookmark and reload directly into a specific sequence's editing view.

**Acceptance Criteria:**

- [ ] OverviewPage reads `?sequence=<uuid>` from the URL via TanStack Router
- [ ] If the param is absent or the UUID does not match any sequence in the project, the page falls back to the main sequence
- [ ] Switching sequences (via the left sidebar, US-012) updates the URL query param
- [ ] Reloading the page restores the same active sequence
- [ ] Typecheck passes

### US-012: Frontend — left sidebar sequence list

**Description:** As a user, I want to see all sequences in the project in a left sidebar so I can switch between them and see their status at a glance.

**Acceptance Criteria:**

- [ ] Left sidebar lists all sequences for the active project
- [ ] Sort order: main first, then alphabetical by name
- [ ] Each row shows: name, "Main" badge (only on the main row), per-sequence status dot (red = part of a cycle, amber = has violations against main, none = satisfied), fragment count
- [ ] Clicking a row sets the URL `?sequence` query param and switches the active editing pane
- [ ] The active sequence is visually highlighted
- [ ] Typecheck passes

### US-013: Frontend — create secondary

**Description:** As a user, I want to create a new secondary sequence by clicking a "+" affordance and naming it inline so I can start outlining a new storyline without modal friction.

**Acceptance Criteria:**

- [ ] "+" button at the bottom (or top) of the sequence list
- [ ] Click creates a new sequence via API with default name `"New sequence"` (with `" 2"`, `" 3"`, etc. suffix on collision)
- [ ] The new sequence is created with `isMain: false` and one default section with an empty name string
- [ ] After creation, the row enters inline-rename mode; the input is focused and selects all
- [ ] Pressing Enter commits the rename; pressing Escape reverts to the default name
- [ ] If the user types a name that collides with an existing sequence, the inline input shows an error and stays in edit mode
- [ ] After rename commits, the new sequence becomes the active editing pane (URL updates per US-011)
- [ ] Typecheck passes

### US-014: Frontend — delete secondary with inline confirm

**Description:** As a user, I want to delete a secondary sequence with a lightweight inline confirmation so I do not lose work accidentally without a heavy modal.

**Acceptance Criteria:**

- [ ] Delete affordance appears on hover/focus of a non-main sequence row (e.g. trash icon)
- [ ] Clicking it replaces the row's content with `"Delete <name>?"` + Cancel + Confirm buttons
- [ ] Confirm calls the delete API; Cancel restores the row
- [ ] Delete is not offered on the main sequence row at all (rendered hidden or disabled)
- [ ] After deletion, if the deleted sequence was the active editing pane, the main sequence becomes active and the URL updates
- [ ] Typecheck passes

### US-015: Frontend — designate-as-main control

**Description:** As a user, I want to make a secondary into the main sequence from the sequence header so the export target reflects the structure I am most happy with.

**Acceptance Criteria:**

- [ ] A "Make main" button appears in the active sequence's detail header when the sequence is `isMain: false`
- [ ] Clicking it calls the designate-as-main API and updates the UI
- [ ] After the flip, the previously-main sequence's header shows "Make main" instead, and the newly-main sequence shows the main badge
- [ ] Sidebar order updates (new main first)
- [ ] Typecheck passes

### US-016: Frontend — section rendering with header and drop zone

**Description:** As a user, I want each section to be visually distinct with a labeled header and its own drop zone so I can understand which fragments belong to which section.

**Acceptance Criteria:**

- [ ] OverviewPage editing pane renders every section of the active sequence as a vertical stack (in section-position order), not just `sections[0]`
- [ ] Each section block shows: header (section name; placeholder text "Untitled section" if name is empty string), followed by the section's horizontal fragment drop zone with the existing dashed-border styling
- [ ] An empty section displays a "Drop fragments here" placeholder inside its drop zone (matching the current main-zone empty state)
- [ ] Drag-and-drop between sections within the same sequence works via the existing `move-fragment` command (which already accepts cross-section targets)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-017: Frontend — create and inline-rename section

**Description:** As a user, I want to add a new section via an inline affordance and immediately name it so I can quickly subdivide a sequence.

**Acceptance Criteria:**

- [ ] "Add section" button appears at the bottom of the active sequence's section list (or as an always-visible affordance below the last section)
- [ ] Clicking it calls `create-section` with an empty string name and immediately enters inline-rename mode on the new section's header
- [ ] Existing section headers support inline rename triggered by click or a dedicated rename action (mirror the project-rename pattern in the codebase)
- [ ] Pressing Enter commits via `rename-section`; Escape reverts to the previous name
- [ ] Empty-string names commit successfully and render as "Untitled section" placeholder text
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-018: Frontend — delete section with inline confirm

**Description:** As a user, I want to delete a section via a lightweight inline confirm so I can clean up structure without losing my placed fragments unintentionally.

**Acceptance Criteria:**

- [ ] Each section header shows a delete affordance on hover/focus
- [ ] Clicking it replaces the header with `"Delete section? N fragments will return to the pool"` + Cancel + Confirm
- [ ] Confirm calls `delete-section`; Cancel restores the header
- [ ] The delete affordance is hidden/disabled when this is the only section in the sequence
- [ ] After deletion, the section disappears and its fragments appear in the sequence's pool
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-019: Frontend — per-fragment violation glyph on main

**Description:** As a user viewing the main sequence, I want a warning glyph on any fragment that is out of order relative to a secondary so I can see at a glance where my arrangement diverges from my outlines.

**Acceptance Criteria:**

- [ ] On the main view only, fragments with at least one incoming violation render a small warning glyph
- [ ] Hover tooltip lists each violation as `"Should appear after <predecessor.key> (from <secondary.name>)"`
- [ ] No glyph on fragments without violations
- [ ] No glyph in non-main views even if the fragment appears there (Q14 — violations are relative to main)
- [ ] The glyph is visually distinct from the cycle indicator (US-020)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-020: Frontend — cycle indicator across affected views

**Description:** As a user, I want fragments involved in a cycle to be marked in every view they appear in so I can recognize that the conflict cannot be resolved by reordering within a single sequence.

**Acceptance Criteria:**

- [ ] Fragments in the `fragmentUuids` of any cycle render a cycle indicator (distinct from US-019's violation glyph)
- [ ] Indicator appears on main view and on each secondary view that participates in the cycle
- [ ] Hover tooltip names the secondaries involved
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-021: Frontend — fragment detail in right sidebar

**Description:** As a user, when I select a fragment I want the right sidebar to show its title, where it lives across all sequences, and any violations affecting it, so the right sidebar acts as the outlining-tool surface.

**Acceptance Criteria:**

- [ ] Right sidebar is persistent and always visible
- [ ] Clicking a fragment selects it; clicking empty area deselects
- [ ] When selected, the sidebar shows: fragment `key` and `excerpt` (reuse existing `TileContent`-style rendering), membership list across all sequences (`"<sequence.name>: <section.name>, position <n>"` for each placement; empty-name sections render as "Untitled section"), violations affecting this fragment (always relative to main, regardless of which sequence is active), an "Open fragment" action that routes to the existing fragment editor
- [ ] Membership list is sorted main-first then alphabetical by sequence name
- [ ] If the fragment is not placed in main, the violation list is empty (no false positives)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-022: Frontend — right sidebar project warnings panel

**Description:** As a user, when no fragment is selected I want the right sidebar to summarize all cycles and violations in the project so I have one screen for triaging problems.

**Acceptance Criteria:**

- [ ] When no fragment is selected, the right sidebar shows the project warnings panel
- [ ] Top section: Cycles. Each cycle entry lists the secondaries involved by name and the fragments in the SCC
- [ ] Below: Per-secondary violation summaries. Each non-main sequence with at least one violation shows its name and the count
- [ ] Clicking a sequence name in either section switches the active editing pane to that sequence (and updates the URL per US-011)
- [ ] Empty state: when there are no cycles and no violations, panel shows a brief "No constraint conflicts" message
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- **FR-1:** A project supports an unbounded number of sequences. Exactly one is `isMain: true` at all times.
- **FR-2:** Sequence names are unique within a project (case-sensitive). Creation or rename that would collide is rejected by the API.
- **FR-3:** The main sequence cannot be deleted. Deletion of the main rejects with a structured error directing the user to designate another sequence as main first.
- **FR-4:** Any non-main sequence can be designated as the new main via a single atomic API command; the previous main is downgraded to non-main in the same transaction.
- **FR-5:** A fragment may appear in any sequence and may appear in many sequences simultaneously, but at most once per sequence. Placement in one sequence is fully independent of placement in any other.
- **FR-6:** Each sequence has its own independent unassigned pool = project fragments not placed in that sequence.
- **FR-7:** The flat order of a sequence is defined as sections-in-position-order, then fragments-in-position-order within each section.
- **FR-8:** Every non-main sequence projects a constraint onto main: for any pair (A, B) where A precedes B in the secondary's flat order, if both A and B are placed in main, A must precede B in main's flat order. Gaps are allowed (subsequence relation, not contiguous adjacency).
- **FR-9:** A violation is `{ fragmentUuid, predecessorUuid, secondaryUuid }`. Violations are computed only when both endpoints are placed in main.
- **FR-10:** A cycle is a non-trivial strongly-connected component in the union graph of all secondaries' pairwise constraint edges. Cycle detection runs on every read.
- **FR-11:** Secondaries that participate in any cycle are excluded from per-fragment violation computation until the cycle resolves.
- **FR-12:** Violations and cycles are recomputed live on every read of the sequence list; nothing is cached.
- **FR-13:** The API returns `{ sequences, violations, cycles }` as a bundled payload on every sequence-related request (read or mutation), including section CRUD commands.
- **FR-14:** The frontend renders per-fragment violation glyphs only on the main view; cycle indicators render on every view the affected fragments appear in.
- **FR-15:** The right sidebar is persistent. With a fragment selected: detail panel. With nothing selected: project warnings panel.
- **FR-16:** A new secondary is created with one default section whose `name` is the empty string.
- **FR-17:** Every sequence must contain at least one section at all times. Deletion of the last remaining section in a sequence is rejected.
- **FR-18:** Section names are not subject to uniqueness constraints. Two sections in the same sequence may share a name.
- **FR-19:** Deleting a non-empty section removes its `fragment_positions` rows; the affected fragments return to that sequence's unassigned pool. The fragments themselves are not deleted from the project.
- **FR-20:** Active sequence selection is persisted in the URL via `?sequence=<uuid>`. Absent or invalid values fall back to the main sequence.

## Non-Goals (Out of Scope)

- Hard-constraint mode (per-secondary or global toggle). Will arrive in a later slice with the placement engine.
- Semi-random or automatic placement modes. The sequencer remains manual-only in this slice.
- Fitting score calculation, key fragments, arc overlays, and noise. All deferred per `specifications/sequencer.md`.
- Drag-and-drop of fragments from one sequence into another (cross-sequence drag). Place in each sequence independently for now.
- Split views (multiple sequences visible at once). Deferred.
- Predictive drag feedback ("dropping here would violate X"). Violations are only computed after the drop completes.
- Generating secondaries automatically from main's order. Out of scope per the existing spec.
- **Section reordering UI.** Sections can be created / renamed / deleted in this slice but cannot be reordered via drag — that ships with a later slice.
- Click-to-color-code-per-secondary on violation glyphs. The glyph is a single consistent warning; the secondary identity surfaces via tooltip and the warnings panel.
- Real-time push of changes. The app is single-user local-first; mutation-response refetch is sufficient.

## Design Considerations

- **Layout.** Left sidebar = sequence list. Right sidebar = persistent, two modes. Active editing pane between them shows one sequence at a time, rendered as vertical stack of section blocks.
- **Status dot semantics.** Red (cycle) > Amber (violations against main) > None (satisfied). Only one dot per row; red wins over amber.
- **Glyph distinction.** Violation glyph (US-019) and cycle indicator (US-020) must be visually distinct. Suggest: warning triangle for violation, broken-loop icon for cycle. Both small, no count badges.
- **Tooltip content.** Reuse the existing `fragment.key` rendering for predecessor references so tooltips look identical to fragment cards.
- **Inline rename UX.** Reuse whatever inline-rename pattern already exists in the project (e.g. project rename, if present). Keep behavior consistent across sequences and sections.
- **Inline confirm UX.** Sequences (US-014) and sections (US-018) share the same inline-confirm pattern: header content replaced by `"Delete X?"` + Cancel + Confirm. Keep visual and keyboard behavior identical.
- **Empty-section placeholder.** Sections with no fragments show "Drop fragments here" inside their drop zone — matches the existing main-sequence empty state text.
- **Empty-name sections.** Renders as muted placeholder text "Untitled section" in section headers and in the right-sidebar membership list.

## Technical Considerations

- **Package boundary.** `@maskor/sequencer` is pure logic. `getFragmentOrder`, `computeViolations`, `detectCycles` are pure functions. No DB or filesystem access from within the package.
- **API layer.** Commands live in `packages/api/src/commands/sequences/`. Existing commands (`create-sequence`, `delete-sequence`, `update-sequence`, `place-fragment`, `move-fragment`, `unplace-fragment`) need their response shape updated to bundled form. New command files: `designate-sequence-main.ts`, `create-section.ts`, `rename-section.ts`, `delete-section.ts`.
- **Storage helpers.** `storageService.sequences` needs section-aware mutators (or the commands compute the new sequence state and call `write`). Mirror the existing `place-fragment` pattern, which reads the indexed sequence, transforms it, then writes the result.
- **Cycle algorithm.** Tarjan's SCC over the union graph. Edges: for each secondary, for each adjacent pair (A, B) in flat order, add edge A → B. SCCs of size > 1 are cycles. Track edge → secondary mapping during construction so `Cycle.sequenceUuids` can be populated.
- **Performance.** Realistic ceiling: ~500 fragments, ~20 sequences. Cycle detection and violation computation are linear in edges; total cost is negligible. Do not pre-emptively add caching tables.
- **DB schema.** No changes. `sequences.is_main`, `sequences.name`, `sections`, `fragment_positions` already cover the requirements. The partial unique index on `is_main` continues to enforce exactly-one-main-per-project.
- **Vault format.** No changes. Existing YAML supports `isMain: true | false` and arbitrary sections. Secondaries are just YAML files with `isMain: false` in `<vault>/.maskor/sequences/`.
- **Atomic main flip.** The designate-as-main command must wrap both `is_main` updates in a single SQLite transaction. Verify the partial unique index permits the intra-transaction state on a real DB before relying on it.
- **Fragment uniqueness.** `validateSequenceInvariants` is already per-sequence scoped. Per-project multi-sequence membership requires no new validator — it works for free.
- **Codegen.** Per `packages/frontend/CLAUDE.md`, every new API command needs the orval client regenerated after the API change. Do not hand-roll `useMutation` against `customFetch`.
- **Section position compaction.** Deleting a section in the middle of a sequence requires renumbering remaining sections' `position` values to remain dense (0..N-1). Mirror the existing fragment-position compaction pattern in `@maskor/sequencer`.
- **URL routing.** Use TanStack Router's `useSearch` / `useNavigate` to read and write the `?sequence` param. Define the search schema on the route so invalid values are surfaced as zod validation errors and the page can fall back gracefully.
- **Test isolation.** Use the existing `test-fixtures` vault for integration tests. Per the project CLAUDE.md, delete `vault.db` rather than running migrations for test setup.

## Success Metrics

- A user can create a project with one main and multiple secondaries, place fragments in all of them, and the UI shows violations correctly within one redraw of any drag-drop mutation.
- Round-trip cost (drag a fragment → API call → recomputed response → UI redraw) stays under 50 ms locally for projects up to 500 fragments / 20 sequences.
- Zero unit-test or integration-test regressions in the existing single-main implementation.
- Cycle detection correctly identifies every contrived cycle test case and produces no false positives on acyclic projects.
- Re-deriving DB state from the vault produces identical sequences, violations, and cycles before and after a full DB rebuild.
- Section CRUD works identically for main and secondary sequences (no special-case paths).

## Open Questions

- **Future: cross-sequence drag-drop.** Once secondaries exist, dragging a fragment from main into a secondary's pool is a natural affordance. Deferred but worth designing the drag-source/target abstraction so it can be added without a rewrite.
- **Section reordering scope.** Listed as out-of-scope here. Worth its own focused slice — likely a small one — once US-016 ships and users have a feel for multi-section sequences.
