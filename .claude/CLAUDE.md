If you ever encounter anything surprising in the code base, notify the developer.

This is a greenfield project with no live users.

KEEP IN MIND:

- When asked to plan, write the plan to `@references/plans/` and use the format described in `@references/plans/_template.md`.
- Plans are for review, not immediate execution. Do not implement until clearly instructed by the user.
- Think critically. Push back on bad decisions. Flag unintended consequences.
- Run relevant tests after changes.
- Add suggestions to `@references/SUGGESTIONS.md` when encountering issues or surprises that are not immediately fixed.
- Be succinct. Short sentences, no fluff.
- Keep `README.md` files up to date with developer-facing documentation.
- Reference `@references/CODEBASE_SNAPSHOT.md` when you need to traverse the codebase. Use `Grep` to locate symbols, types and files without traversing the source tree. Regenerate with `bun run snapshot` after structural changes.
- Reference `@specifications/` when developing features. All top-level concepts should be tracked by a spec. Is a spec.
- Verify changes with `bun run typecheck` and format with `bun run format`.
- Write tests when adding features or changing behavior.
- Update references and specs if they are out of sync.
- When writing code, try to match the coding style in the already existing code.
