# Project Specs

Project name: "Maskor"

## Goal

To build an opinionated tool for managing large writing projects using fragments. The tool allows for a non-linear writing style where multiple plots, arcs, themes, characters, timelines, can be weaved together and processed by the writer.

Fragmented writing creates effect through an organic interleaving of thoughts and themes. Randomness, or the feeling of randomness, enhances this effect. This tool embraces randomness, accidents, unique pairings.

Core feature: a fragment editor that prompts the user to process fragments one-by-one in a non-linear fashion.

Important layers:

### Storage manager

<!--CONSIDER: is this a mistake? jump straight to a database? -->

A basic system for managing fragments, aspects, notes, etc. For now, this can be done using Obsidian, which will be the source of truth. In the future, this can be replaced. A watcher layer will keep the tools internal database in sync with the Obsidian vault.

IMPORTANT: File ownership is important. The writing files and settings should be stored in a human-readable format whenever possible.

For example, Obsidian can for now track fragment title, content and properties. Properties should be stored in the frontmatter. A complementary database is probably necessary for quick note lookups, complex queries, additional data, etc.

An edit in obsidian should trigger a file watcher that updates the internal database, frontend views, and possibly also processing queues. Changing a timestamp or adding an enforced fragment order could make a fragment placement in a sequence invalid, forcing the user to re-place it.

### Fragment editor

The content of the fragment itself can be managed by Obsidian, but metadata, aspect creation, properties, sections, etc, are mostly managed by a specific editor. This editor shows one fragment at a time, pulls one randomly based on various scoring metrics, and prompts the user to process it further. This is the core of the tool.

### Project configuration

A setup view for configuring "aspects", i.e different components of the writing project. Could be a theme, a character, or a place, etc. The project view should also contain "arcs" which specify how different aspects rise and fall in intensity. This could be a character arc, but could also relate to any other theme or concept within them project.

Finally, the project configuration should contain a rough "interleaving" which specify how different fragments might be mixed. Can two similar fragments follow each other? What fragments cannot follow each other? Should certain fragments be prioritized? All this can be specified.

### Sequencer

A view for arranging fragments in the desired order. Could be manual, working with semi-random "fragment suggestions" that the user accepts or rejects, or initially automatic, where all fragments are placed on a global sequence, where the user is free to re-arrange.

### Overview

An overview where all fragments can be seen on a "sequence". Please note that the sequence might not represent linear time, but rather the order of pieces in the final work. The overview should allow for inspecting arcs, aspects, and other properties using diagrams, graphs and color-coding.

### Export

A simple export for converting the sequence of fragments to a single text file, PDF or word document.

## Domain model

### User

The owner of a project.

### Action

A user action. Should be added to a human-readable log. Can ideally be reverted.

### Project

A project with a configuration. Container for all fragments, however keep the possibility of cross-project fragments in mind. A project can contain multiple "sequences" for different purposes, sketching, testing purposes.

### Aspect

An important component of the writing project. Could be a character, theme, event, place, time, etc. Aspects can be attached to a fragment to indicate that this fragment pertains to these specific aspects. An optional "intensity" level indicate how _much_ the fragment relates to the aspect.

### Arc

A graph indicating rises and falls in a specific "aspect" of the writing project. Arcs DOES NOT control frequency, just intensity/amount. The frequency of certain fragment types are controlled by the interleaving.

### Interleaving

How different arcs interact, how often they occur, how frequently they are switched in the overall order of fragments, etc.

The interleaving is an algorithm that intentionally could be defined/implemented in many different ways. Possible features:

- Fragment weights
- Rules, i.e fragments with aspect A cannot follow fragments with aspect B
- Constraint graph
- Time-specific weights, i.e certain fragments are more probable in the beginning, less likely later on.
- Sections with specific rules, i.e part A has one interleaving pattern, part B has another
- "Hand-drawn" arc interaction patterns.
- Auto-generated fitting algorithms based on initial user-specified ordering

### Sequences

Sequential ordering of fragments. Could be the "main sequence" which indicates the final order of fragments, or secondary sequences that locks certain fragments in an order, but allows for other fragments to be added in-between.

### Pieces

A piece of raw writing, usually imported from another source, such as a word file or PDF. Does not necessarily have a UUID or other metadata. This is a temporary, incomplete data structure, which automatically or with some user assistance must be converted to a fragment before further processing. Pieces cannot be created manually, they only exist as an intermediary during the importing process. When a fragment is created, the original piece is discarded.

### Fragments

The logical container of a piece of writing. Should have a title, UUID, metadata properties, hash, a state indicating how "finished" the fragment is, or other properties.

Note: the user can add custom properties to fragments. These are then used in conjunction with outlining, interleaving and organizing views to get an overview of the structure.

"Aspects" are important properties of fragments. Most aspects should probably have an "intensity" factor that indicates how well it fits on an "arc".

### Pools

Pools are containers for fragments and pieces. They indicate processing level on a high level. Pools have a logical flow:

- **unprocessed**: where raw pieces end up before they are converted to fragments
- **incomplete**: fragments that are missing properties
- **unplaced**: complete fragments that have not been placed in the sequence
- **discarded**: fragments that have been removed

A fragment leaves the pool when it is placed in a sequence, but could be moved back whenever.

### Fitting

A score that indicates how well a fragment fits its current place in the sequence. Based on aspects, arcs and strict requirements, for example, sometimes fragment B has to follow fragment A.

### Keys

User-specified key fragments that always occur at a (rough) specific place in the sequence. For example, a set first, last and middle fragment.

### Sections

User-specified sections that are sequenced independently. Fragments properties can optionally include a section specifier. This fragment will always end up in the specified section. Sections can be used as "groups" in the sequencing view, and re-ordered as individual elements.

Sections and keys might be mutually exclusive, not sure yet.

### Noise

Deterministic noise that introduces randomness in the sequencer. This might be desirable to introduce surprise, unique pairings, new ideas, or an organic feel into the sequencing. The random noise should displace the fitting score for each fragment by a user-defined min/max amount, which might result in a different placement.

Noise should be seeded, resulting in the same noise value for the same fragment input. Running the sequencer multiple times should only have a different result if the user explicitly sets the seed to be random.

The user could also define a specific seed.

### Sequencer

<!-- TOO DETAILED? -->

A deterministic placement engine that takes fragment based on properties and places them in order. Either one by one, where the user can accept or reject a fragment (rejected fragments get a cool down, so that they do not instantly re-appear), or all at once.

The sequencer tries to follow arcs, respect interleaving and locked fragment ordering, and secondary user-specified sequences.

The sequencer uses the "fitting" score as the core guiding principle. It always tries to grab the fragment with the highest score. However, it also tries to detect loops and deadlocks. Sometimes, user-specified rules might result in impossible fragment orders. This needs to be detected and resolved.

Finally, based on an existing sequence (which might be user-specified), a project configuration that fits the sequence can be generated. This allows the user to arrange some initial fragments with satisfying arcs and interleaving, add some random noise, and then get the final project config without having to create each arc and rule manually.

### Notes

Notes for the user themselves. Can be attached to projects, sequences, fragments, arcs, aspects, etc.

### References

References to sources or inspirations. Can be attached to fragments.

## Architecture

Monorepo structure with packages stored in `packages/`. Each package should eventually be deployable as a docker container, or bundled using `bun` and run as a sidecar in `Tauri`.

Packages:

- `packages/api/`: Main API for managing fragments, adding metadata, sequences, aspects, arcs, etc.
- `packages/frontend/`: Frontend for fragment editor, sequencing and overview.
- `packages/importer/`: Tool for importing writing from other file formats and splitting it into fragments.
- `packages/processor/`: Responsible for managing queues and converting pieces to fragments, etc.
- `packages/sequencer/`: Contains the core sequencing and fitting logic.
- `packages/shared/`: Project-wide type definitions, util functions, logger, etc.
- `packages/storage/`: Vault I/O, SQLite index, project registry, storage service.
- `packages/test-fixtures/`: Shared test vault fixtures used across packages.
