This is a monorepo for a fragmented writing app written with `bun`, `typescript` and `react`, with "Obsidian" acting as the "backend" for now. See `@project_specs.md` for more detailed information about the project.

The project uses `bun`, `typescript`, a storage solution, a file watcher, processing queue (`redis`?), a fragment api, an import manager for consuming word files etc, a sequencer that helps place the fragments in the desired order, and a shared package for type declarations and utils.

Possible technologies:

- bun
- typescript
- redis
- postgres/sqlite (or another relational database)
- drizzle
- obsidian
- pandoc
- chokidar
- hono
- tauri or electron
- react
- d3
- remkar, mdx

Please note that all tools and technologies are not settled yet. Suggest better options wherever applicable.

## Development rules

### Rule 1: Learning

This project is opinionated. It is made for personal use, but is expansive by design, to help me learn new concepts. It should span multiple services, apis, databases, ORMs, dockerfiles, file watchers, etc. I want to learn. Prioritize quick suggestions and explanations, and always ask before doing large code changes. Create plans and showcase your thinking for me to review, but be ready to just execute when I tell you to.

### Rule 2: Challenge the direction

Think critically. Challenge my suggestions and suggest more better options when applicable. Push back if there's a smarter, more effective alternative to reach the goal. Always be clear about any unintended consequences or problems down the line a decision might have.

### Rule 3: Test before you respond

After making changes, run the commands or test related to the changes and check for errors. Do not say "done" unless the code has been tested.

### Rule 4: Add suggestions

At the end of every major change, add, remove or update an actionable item to the `@references/SUGGESTIONS.md` file. This should be something that is missing, could be improved or that you think really needs changing. Be specific, pointing to files, errors or issues that I can observe myself.

### Rule 5: Consider context

Be succinct. Keep context length in mind. Prefer short, snappy sentences and remove fluff. Bullet points are better than long paragraphs. However, do not skip or exclude important information.

## References

Additional references, such as diagrams, documentation, etc. Add new references to the `@references/` folder.

Also, keep the `packages/*/README.md` files up to date as you work on a feature. These should contain short but clear documentation of the package and its feature. Context length is important, so keep that in mind. The README should act as a quick context-refresher when working on a package.

## Planning

When asked to plan, echo a summary of the plan to standard output, but write the full plan to `@references/plans/<topic>`. Create a new file each time, for me to review and edit. Reference the updated plan when implementing features.

When creating plans, always add a a `date` and `status` value below the title of the file. When the plan is implemented, update the `status` field to say "done". Also add a `implementedAt` field with the time of implementation. See format below:

```markdown
**Date**: DD-MM-YYYY
**Status**: Todo <!--Possible values: Todo, In progress, Done --->
**Implemented At**: DD-MM-YYYY <!-- Only add this field when plan is implemented -->
```

## Coding standards

Full standards are in `@references/CODING_STANDARDS.md`. Always follow them. Key rules:

- No abbreviated names — `f` → `file`, `dir` → `directory`, `fm` → `frontmatter`, etc. Exceptions: `id`, `uuid`, `acc`, single-letter iterators.
- Use spread syntax over manual property mapping. Exclude with destructuring: `const { c: _, ...rest } = original`.
- Regex constants end in `_REGEX`.
- Explicit braces on all `if` bodies. Explicit `return` in multi-line arrow functions.
- Prefer `reduce` over `for...of` when accumulating into an object.
- No redundant intermediate type casts (`as string as T` → `as T`).
- Descriptive fallback identifiers — not `"Untitled"`.
- Mark known limitations with `// TODO:` and a reason.

## When done

When you are done with implementing a `plan` or running a large task, always run `bun run test`, `bun run format` and `bun run typecheck`. If anything breaks, fix.

## Manual development

I will frequently edit code manually. This might cause the code to not fully match your memory, `references/` files, `project_specs.md` or `README.md` files. If you encounter discrepancies, but no major bugs or problems, simply update the `reference/` files, memory and other documentation. Feel free to ask if you need clarification.

Happy coding.
