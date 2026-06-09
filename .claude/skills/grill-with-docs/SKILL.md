---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (_glossary.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, do so. Check `references/CODEBASE_SNAPSHOT.md` first, then `grep` for symbols. Regenerate the snapshot with `bun run snapshot` if it looks stale.

</what-to-do>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

This project has a single domain. Canonical locations:

- **Glossary**: `specifications/_glossary.md` — defines domain terms. Pure language, no implementation.
- **Specifications**: `specifications/*.md` — design docs that _use_ the language defined in the glossary.
- **ADRs**: `references/adr/NNNN-slug.md` — sequentially numbered decision records.
- **Codebase snapshot**: `references/CODEBASE_SNAPSHOT.md` — read this before traversing source.

The packages under `packages/` (`api`, `storage`, `frontend`, `importer`, etc.) are technical layers, not bounded contexts. Don't create per-package glossaries or ADR folders.

Create files lazily — only when you have something to write. Create `specifications/_glossary.md` when the first term is resolved; create `references/adr/` when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `specifications/_glossary.md` (or that appears with a different meaning across `specifications/`), call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update the glossary inline

When a term is resolved, update `specifications/_glossary.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

The glossary should be totally devoid of implementation details. Specs in `specifications/` describe how things work; the glossary only defines what the terms mean. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

</supporting-info>
