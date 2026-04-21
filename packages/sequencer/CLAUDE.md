# Sequencer Package — Coding Guide

Runtime: **Bun**.

## Package role

Stateless placement library. Given fragments, arcs, interleaving config, and a noise seed, produces a deterministic ordered sequence. No service, no persistence — pure functions in, sequence out.

**Current state**: stub. `src/index.ts` is empty.

## Intended design

- **Stateless** — all inputs passed in, sequence returned. Same inputs + same seed = same output.
- Placement engine: places fragments one-by-one using a fitting score (aspects, arcs, interleaving rules).
- Handles keys (pinned positions), sections (independently sequenced groups), and locked orderings.
- Detects and resolves loops/deadlocks from conflicting rules.
- Noise: deterministic, seeded displacement of fitting scores — user-controlled min/max range.

## Modes (from project specs)

| Mode | Description |
|------|-------------|
| Manual | User arranges fragments directly |
| Semi-random | Sequencer suggests; user accepts/rejects (rejected = cooldown) |
| Automatic | All fragments placed; user rearranges |
| Reverse | Generate arcs/rules from an existing user-ordered sequence |

## Key types

Import `Fragment`, `Aspect`, `Arc`, `Sequence`, `Interleaving` from `@maskor/shared`. Never re-declare domain types here.
