# Archive original import bytes

Imports now archive the original uploaded file byte-for-byte under `.maskor/imports/`, referenced by the resulting import-sequence's `origin`. This reverses `import-pipeline.md`'s prior resolution (2026-05-15) that the source file is *discarded* after import. The archive is the durable record of imported content: fragments drift as the user edits, merges, and discards them, so the live import-sequence's fragment references are not a faithful snapshot of what was imported — the archived original is.

## Considered Options

- **Converted markdown** (post-conversion, pre-split) — rejected in favour of true byte-fidelity to what the user actually imported.
- **Both original + converted** — rejected as redundant; the converted form is reconstructable from fragments via the exporter.

## Consequences

- Binary (e.g. `.docx`) now lives in the vault, but only under `.maskor/` (Maskor-managed, watcher-ignored) — the all-markdown convention for the user-authored entity folders (`fragments/`, `aspects/`, …) is unaffected.
- `.maskor/imports/` is swept into Draft snapshots, so projects with many/large imports grow their draft size. Accepted.
- A future reader seeing `.docx` files in the vault, or the contradiction with the older "source discarded" resolution, should look here.
