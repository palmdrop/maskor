If you ever encounter anything surprising in the code base, notify the developer.

This is a greenfield project with no live users.

KEEP IN MIND:

- Think critically. Push back on bad decisions. Flag unintended consequences.
- Add suggestions to `@references/SUGGESTIONS.md` when encountering issues or surprises that are not immediately fixed.
- Be succinct. Short sentences, no fluff. Skip filler words. Sentence fragments are fine.
- Reference `@references/CODEBASE_SNAPSHOT.md` instead of traversing the codebase. `grep` to locate symbols, keywords and code snippets. Regenerate with `bun run snapshot`.
- Verify changes with `bun run test`, `bun run typecheck` and `bun run format`.
- Write tests when adding features or changing behavior.
- Make note of `specifications` that are out of sync with the code or direction.
- When writing code, match the style of the already existing code.
- When writing code, NEVER ABBREVIATE variable names (except iterators). `err` should be `error`. Fix whenever you encounter abbreviations.
- DO NOT IMPLEMENT unless clearly stated. When asking about an issue, do not immediately fix. Discuss first. Implement when asked.
