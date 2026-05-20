# Glossary Format

The glossary lives at `specifications/_glossary.md`. It is the canonical source for domain language. Specs in `specifications/` use these terms; the glossary defines them.

## Structure

```md
# Glossary

{One sentence on what this project is, so terms have a frame of reference.}

## Language

**Fragment**: A unit of writing the user is drafting or revising. _Avoid_: snippet, note, draft.
**Aspect**: A facet a fragment can be evaluated against. _Avoid_: dimension, axis, criterion.
**Arc**: A sequence of fragments forming a narrative or thematic progression. _Avoid_: chain, thread.
**Project**: The top-level container holding fragments, arcs, and config. _Avoid_: workspace, notebook.

## Flagged ambiguities

**Draft** — used in `drafting.md` to mean an in-progress fragment, but in `export.md` to mean an exported document. Resolution: use _drafting_ for the act, _fragment_ for the artifact, _export_ for the output.
```

## Rules

- **One line per term.** Bold name, colon, one-sentence definition, `_Avoid_:` list. If a term needs more than a sentence, the definition isn't tight enough yet.
- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_:`.
- **Flag conflicts explicitly.** If a term is used ambiguously across specs, call it out in `## Flagged ambiguities` with a resolution.
- **Define what it IS, not what it does.** Behavior belongs in specs.
- **Only include project-specific terms.** General programming concepts (timeouts, error types, utility patterns) don't belong even if used extensively. Ask: is this unique to maskor's domain, or general? Only the former.
- **Group under subheadings only when natural clusters emerge.** A flat list is fine until it isn't.
