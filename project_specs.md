# Project Specs

Project name: "Maskor"

## Goal

To build an opinionated tool for managing large writing projects using fragments. The tool allows for a non-linear writing style where multiple plots, arcs, themes, characters, timelines, can be weaved together and processed by the writer.

Fragmented writing creates effect through an organic interleaving of thoughts and themes. Randomness, or the feeling of randomness, enhances this effect. This tool embraces randomness, accidents, unique pairings.

Core feature: a fragment editor that prompts the user to process fragments one-by-one in a non-linear fashion.

Important layers:

### Fragment manager

A basic system for managing fragments. For now, this can be done using Obsidian. In the future, this can be replaced. An watcher layer will keep the tools internal database in sync with the Obsidian vault.

IMPORTANT: File ownership is important. The writing files and settings should be stored in a human-readable format whenever possible.

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

## Core concepts

### User

The owner of a project.

### Action

A user action. Should be added to a human-readable log. Can ideally be reverted.

### Project

A project with a configuration. Container for all fragments, however keep the possibility of cross-project fragments in mind. A project can contain multiple "sequences" for different purposes, sketching, testing purposes.

### Aspect

An important component of the writing project. Could be a character, theme, event, place, time, etc. Aspects can be attached to a fragment to indicate that this fragment pertains to these specific aspects. An optional "intensity" level indicate how _much_ the fragment relates to the aspect.

### Arc

A graph indicating rises and falls in a specific "aspect" of the writing project. Could indicate how the intensity of the aspect changes. IT IS UNDECIDED if an arc also controls frequency, or if that is left fully to the interleaving setting.

### Interleaving

How different arcs interact, how often they occur, how frequently they are switched in the overall order of fragments, etc.

### Sequences

Sequential ordering of fragments. Could be the "main sequence" which indicates the final order of fragments, or secondary sequences that locks certain fragments in an order, but allows for other fragments to be added in-between.

### Pieces

A piece of raw writing, usually imported from another source, such as a word file or PDF. Does not necessarily have a UUID or other metadata.

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

User-specified key fragments that always occur at a (rough) specific place in the sequence.

### Sections

User-specified sections that are sequenced independently. Fragments properties can optionally include a section specifier. This fragment will always end up in the specified section. Sections can be used as "groups" in the sequencing view.

### Noise

Deterministic noise that introduces randomness in the sequencer.

### Sequencer

A deterministic placement engine that takes fragment based on properties and places them in order. Either one by one, where the user can accept or reject a fragment (rejected fragments get a cool down, so that they do not instantly re-appear), or all at once.

The sequencer tries to follow arcs, respect interleaving and locked fragment ordering, and secondary user-specified sequences.

The sequencer uses the "fitting" score as the core guiding principle. It always tries to grab the fragment with the highest score. However, it also tries to detect loops and deadlocks. Sometimes, user-specified rules might result in impossible fragment orders. This needs to be detected and resolved.

Finally, based on an existing sequence (which might be user-specified), a project configuration that fits the sequence can be generated. This allows the user to arrange some initial fragments with satisfying arcs and interleaving, add some random noise, and then get the final project config without having to create each arc and rule manually.

### Notes

Notes for the user themselves. Can be attached to projects, sequences, fragments, arcs, aspects, etc.

### References

References to sources or inspirations. Can be attached to fragments.

## Architecture

See `@CLAUDE.md`.
