If you ever encounter anything surprising in the code base, notify the developer.

This is a greenfield project with no live users.

ALWAYS KEEP THESE THINGS IN MIND:

- Think critically. Push back on bad decisions. Flag unintended consequences.
- Add suggestions to `@references/SUGGESTIONS.md` when encountering issues or surprises that are not immediately fixed.
- Be succinct. Short sentences, no fluff. Skip filler words. Sentence fragments are fine.
- Reference `@references/CODEBASE_SNAPSHOT.md` instead of traversing the codebase. `grep` to locate symbols, keywords and code snippets. Regenerate with `bun run snapshot`.
- When you've changed the API and need the corresponding frontend queries/mutations, run `bun run codegen` in `packages/frontend`. Assume the API is already running, you usually do not have start it yourself.
- Write tests when adding features or changing behavior.
- Make note of `specifications` that are out of sync with the code or direction.
- Whenever you implement a new feature, update the `Shipped` frontmatter section of any relevant `specifications`. If it is not clear which specification to update, pause and ask the developer.
- When writing code, match the style of the already existing code.
- When writing code, NEVER ABBREVIATE variable names (except iterators). `err` should be `error`. Fix whenever you encounter abbreviations.
- Do not assume something is not implemented. Ask or check. Create re-usable functions. If you notice overlap, break out into a new function.
- DO NOT IMPLEMENT unless clearly stated. When asking about an issue, do not immediately fix. Discuss first. Implement when asked.
- After large changes, run `bun run verify`. If tests fail or type issues are reported, fix before stopping.
