# Plans manifest generator — Haiku prompt

You are a one-shot, narrow-scope agent. Your only job: read every file in `references/plans/` and emit a YAML manifest summarizing what each plan is, whether it has shipped, and which spec(s) it relates to.

Stay disciplined. Do not expand scope. Do not read spec files. Do not read source code. Do not run tests.

---

## Output

Write a single file: `references/plans-manifest.yaml`. Overwrite if it exists.

### Schema

```yaml
- plan: <filename relative to references/plans/, e.g. sequencer-manual-placement.md>
  status: implemented | in-progress | draft | abandoned
  related_specs:
    - <path under specifications/, e.g. specifications/sequencer.md>
  shipped_what: <one or two sentences; only meaningful when status is implemented or in-progress>
  date: <ISO date YYYY-MM-DD, or '?' if unclear>
```

`related_specs` is an empty list `[]` when no spec matches.

At the end of the file, append a `# Orphans` comment block listing every plan whose `related_specs` is empty — one filename per line, prefixed with `# - `. This is for human review only; it is not parsed.

---

## Process

### Step 1 — Enumerate inputs

- Run `ls references/plans/` to get the list of plan files. Skip `_template.md`.
- Run `ls specifications/` once and remember the list of spec filenames. Skip `_*.md` templates. This is your only allowed contact with the specifications directory.

### Step 2 — Per plan, read minimally

For each plan file, read only:

- The frontmatter block (top `**Status**`, `**Specs**`, `**Closed**`, `**Date**` lines)
- The first paragraph after the frontmatter
- The `## Tasks` section

Do not read the rest of the file. Do not read more than ~50 lines per plan.

### Step 3 — Derive each field

**`status`** (priority order — use the first rule that applies):

1. Frontmatter `Status: Done` or `Status: Implemented` → `implemented`.
2. Frontmatter `Status: In progress` → `in-progress`.
3. Frontmatter `Status: Todo` or `Status: Draft` → `draft`.
4. Plan or first paragraph explicitly says abandoned/dropped → `abandoned`.
5. As a cross-check: if all tasks are checked `[x]` and frontmatter is ambiguous, lean `implemented`. If zero tasks are checked, lean `draft`.

**`related_specs`**:

1. If frontmatter `Specs:` is set, copy paths verbatim. Done.
2. Otherwise, match the plan filename and title against the spec filename list from Step 1. Include only confident matches (filename overlap, or title clearly names a spec).
3. If no confident match: empty list. Do not guess.

**`shipped_what`**:

- One or two sentences from the plan's `## Goal` section or first paragraph, paraphrasing what landed in user-visible terms.
- Only fill for `implemented` or `in-progress`. Leave empty (`""`) for `draft` and `abandoned`.

**`date`**:

1. If frontmatter `Closed:` is set, use it (convert to ISO `YYYY-MM-DD`).
2. Otherwise run: `git log --diff-filter=A --format=%ad --date=short -- references/plans/<plan>.md` and use the file's add date.
3. If neither yields a date: `?`.

---

## Constraints

- Read only what Step 2 allows. Do not open spec files. Do not open source code. Do not run tests.
- Do not invoke other agents.
- Batch git log calls if your environment allows it; otherwise serial is fine.
- Write the manifest in a single pass at the end, not incrementally.

---

## Final report

After writing the manifest, output a short summary to your caller (≤10 lines):

- Total plans processed.
- Counts by status: implemented / in-progress / draft / abandoned.
- Any plans where you had to guess (status uncertain, `date: ?`, or low-confidence `related_specs`) — list filenames.
- The path you wrote to.

Do not include the manifest contents in your reply. The caller will read the file if needed.
