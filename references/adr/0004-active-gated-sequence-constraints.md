# Active-gated sequence constraints

The sequencer previously consumed *every* non-main sequence as an ordering constraint, with no opt-out. We added an `active: boolean` to every sequence; the sequencer now consumes only non-main sequences where `active = true`. User-authored secondary sequences default to `active: true` (preserving prior behavior), while auto-created import-sequences default to `active: false` so a captured import order never silently constrains the main sequence until the user opts in.

## Considered Options

- **Flag only on import-sequences** — rejected: reintroduces a special "kind" of sequence after we deliberately chose to model import-sequences as plain editable sequences.
- **Promote-to-activate** (duplicate an import-sequence into a real secondary to make it constrain) — rejected: the snapshot and the constraint become two objects that drift.

## Consequences

- Existing behavior changes: a non-main sequence no longer constrains the main sequence merely by existing. A future reader who expects all secondaries to auto-constrain should look here.
- `active` is meaningless for the main sequence (it is the constraint target, not a constraint) and is ignored there.
- The soft/hard-constraint wording in `sequencer.md` (lines 10 vs 72) remains to be reconciled; the shipped sequencer detects and reports violations rather than enforcing them, so constraints are advisory regardless of `active`.
