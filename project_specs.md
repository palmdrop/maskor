# Project Specs

Project name: "Maskor"

## Goal

An opinionated tool for managing large writing projects using fragments. Supports non-linear writing where plots, arcs, themes, characters, and timelines are weaved together. Embraces randomness and unique pairings.

Core feature: a fragment editor that prompts the user to process fragments one-by-one in a non-linear fashion.

## Important layers

### Storage manager

Manages fragments, aspects, notes, etc. Obsidian is source of truth for now — replaceable later. A watcher keeps the internal DB in sync with the vault.

**File ownership is important.** Writing files and settings should be human-readable wherever possible (e.g. frontmatter for fragment properties). A complementary DB handles fast lookups, complex queries, and additional data.

An Obsidian edit triggers the watcher → updates DB, frontend views, and possibly processing queues. Changing a timestamp or enforced fragment order may invalidate sequence placement, forcing the user to re-place.

### Fragment editor

Obsidian manages content; this editor handles metadata, aspect creation, properties, and sections. Shows one fragment at a time, pulled randomly via scoring metrics. Core of the tool.

### Project configuration

Setup view for configuring "aspects" (themes, characters, places, etc.) and "arcs" (how aspects rise and fall in intensity). Also contains a rough "interleaving" spec — which fragments can follow each other, priorities, constraints.

### Sequencer

View for arranging fragments in order. Modes: manual, semi-random (user accepts/rejects suggestions), or automatic (all fragments placed, user re-arranges).

### Overview

Shows all fragments on a sequence (not necessarily linear time — represents final order). Supports arc/aspect inspection via diagrams, graphs, and color-coding.

### Export

Converts fragment sequence to a single text file, PDF, or Word document.

## Domain model

### User

Owner of a project.

### Action

A user action. Added to a human-readable log. Ideally revertable.

### Project

Container for all fragments and config. Can hold multiple sequences (for sketching, testing, etc.). Keep cross-project fragments in mind.

### Aspect

An important component of the writing project — character, theme, event, place, time, etc. Attached to fragments with an optional intensity level.

### Arc

A graph of rises and falls in a specific aspect. Controls intensity/amount, not frequency. Frequency is controlled by interleaving.

### Interleaving

Algorithm controlling how arcs interact, how often they occur, and switch frequency in the overall fragment order. Possible features:

- Fragment weights
- Rules (aspect A cannot follow aspect B)
- Constraint graph
- Time-specific weights (probable at start, less likely later)
- Sections with specific rules
- Hand-drawn arc interaction patterns
- Auto-generated fitting algorithms from initial user ordering

### Sequences

Sequential ordering of fragments. Main sequence = final order. Secondary sequences lock certain fragments in order but allow others in-between.

### Pieces

Raw writing imported from external sources (Word, PDF). No UUID or full metadata — a temporary intermediary. Must be converted to a Fragment before further processing. The original piece is discarded on conversion.

### Fragments

The logical container for a piece of writing. Has title, UUID, metadata properties, hash, and a readiness state. Users can add custom properties, used in outlining, interleaving, and overview views. Aspects are the key fragment properties — most have an intensity factor for arc fitting.

### Pools

High-level processing containers with a logical flow:

- **unprocessed**: raw pieces before conversion to fragments
- **incomplete**: fragments missing properties
- **unplaced**: complete fragments not yet in a sequence
- **discarded**: removed fragments

A fragment leaves its pool when placed in a sequence, but can be moved back.

### Fitting

Score indicating how well a fragment fits its current position. Based on aspects, arcs, and strict requirements (e.g. fragment B must follow fragment A).

### Keys

User-specified fragments that always appear at a (rough) specific position — e.g. a fixed first, last, or middle fragment.

### Sections

Independently sequenced groups. Fragments can optionally specify a section — they will always end up there. Sections can be re-ordered as units in the sequencing view. Sections and keys may be mutually exclusive (TBD).

### Noise

Deterministic, seeded noise that introduces randomness into the sequencer. Displaces the fitting score by a user-defined min/max, potentially changing placement. Same seed = same result. Seed can be fixed or set to random per run. User can specify a custom seed.

### Sequencer

<!-- TOO DETAILED? -->

Deterministic placement engine. Places fragments one-by-one (user accepts/rejects — rejected fragments get a cooldown) or all at once. Follows arcs, respects interleaving and locked orderings, and secondary sequences. Uses fitting score as core principle. Detects and resolves loops and deadlocks from impossible rule combinations.

Can also generate a project config from an existing sequence — user arranges fragments, adds noise, and gets arcs/rules without manual setup.

### Notes

User notes. Can be attached to projects, sequences, fragments, arcs, aspects, etc.

### References

Source or inspiration references. Can be attached to fragments.

## Architecture

Monorepo under `packages/`. Each package should be deployable as a Docker container or bundled with Bun as a Tauri sidecar.

- `packages/api/` — main API (fragments, metadata, sequences, aspects, arcs)
- `packages/frontend/` — fragment editor, sequencing, overview
- `packages/importer/` — imports writing from other formats, splits into fragments
- `packages/processor/` — manages queues, converts pieces to fragments
- `packages/sequencer/` — core sequencing and fitting logic
- `packages/shared/` — types, utils, logger
- `packages/storage/` — vault I/O, SQLite index, project registry, storage service
- `packages/test-fixtures/` — shared test vault fixtures
