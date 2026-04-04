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

### Rule 5

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

- Avoid abbreviations for function and variable names. A long name using camelcase is preferable. The exception is standardized abbreviations, such as `id` and iterator variables. Example: `const fm = {}` should be `const frontmatter = {}`
- Use spread syntax instead of mapping each value when applicable. For example, instead of `const copy = { a: original.a, b: original.b }` use `const copy = { ...original }`. If certain properties should be excluded, consider this pattern: `const { c: _, d: __, ...rest } = original;`
