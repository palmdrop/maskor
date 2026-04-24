# Coding Standards

Standards derived from code review and CLAUDE.md conventions.

---

## Naming

### No abbreviated variable names or abbreviations in general

Use full, descriptive names — even in callbacks, loops, and short functions. This includes camelCase names for multi-word identifiers.

```ts
// Bad
files.map((f) => this.read(f));
entries.filter((f) => f.endsWith(".md"));
for (const [k, v] of Object.entries(fields)) { ... }
const dir = path("fragments");
export const parseFile = (raw: string): ParsedFile

// Good
files.map((file) => this.read(file));
entries.filter((file) => file.endsWith(".md"));
for (const [key, value] of Object.entries(fields)) { ... }
const directory = path("fragments");
export const parseFile = (rawFile: string): ParsedFile
```

**Exceptions:** standard abbreviations (`uuid`, `id`, `acc` in reduce callbacks, iterator variables like `i`).

### Use spread syntax over manual property mapping

```ts
// Bad
const copy = { a: original.a, b: original.b };

// Good
const copy = { ...original };

// Excluding properties
const { c: _, d: __, ...rest } = original;
```

### Regex constants end in `_REGEX`

```ts
// Bad
const INLINE_FIELD_RE = /^([\w-]+):: (.+)$/;

// Good
const INLINE_FIELD_REGEX = /^([\w-]+):: (.+)$/;
```

NOTE: Anonymous regexes are alright for minor things.

---

## Control flow

### Explicit braces on all `if` bodies

Single-line `if` bodies without braces are not allowed.

```ts
// Bad
if (typeof frontmatter.title === "string") return frontmatter.title.trim();

// Good
if (typeof frontmatter.title === "string") {
  return frontmatter.title.trim();
}
```

### Explicit `return` in multi-condition boolean functions

When a function body spans multiple lines, use an explicit block and `return`.

```ts
// Bad
const hasRequiredFields = (fm: Record<string, unknown>): boolean =>
  typeof fm.title === "string" && fm.title.trim() !== "";

// Good
const hasRequiredFields = (fm: Record<string, unknown>): boolean => {
  return typeof fm.title === "string" && fm.title.trim() !== "";
};
```

### Prefer early returns

Avoid nesting if-clauses and instead use early returns:

```ts
// Bad
if (x > 10) {
  if (y < 5) {
    doThing();
  }
}

// Good
if (x <= 10) return;
if (y >= 5) return;

doThing();
```

Prefer early returns if possible, even when dealing with only one if-clause.

### Prefer arrow functions

Unless there's a specific reason for it, use arrow functions over standard functions:

```ts
// Bad
function doSomething(argument: Type): ReturnType {
  // do something
}

// Good
const doSomething = (argument: Type): ReturnType => {
  // do something
};
```

---

## Data transformation

### Prefer `reduce` over imperative `for...of` when accumulating into an object

```ts
// Bad
const result: FragmentProperties = {};
for (const [key, value] of Object.entries(fields)) {
  const weight = parseFloat(value);
  if (!isNaN(weight)) result[key] = { weight };
}

// Good
const result: FragmentProperties = Object.entries(fields).reduce((acc, [key, value]) => {
  const weight = parseFloat(value);
  if (!isNaN(weight)) acc[key] = { weight };
  return acc;
}, {} as FragmentProperties);
```

---

## Type assertions

### No redundant intermediate casts

```ts
// Bad
uuid: frontmatter.uuid as string as FragmentUUID;

// Good
uuid: frontmatter.uuid as FragmentUUID;
```

---

## Fallbacks

### Prefer descriptive fallback identifiers over generic strings

When generating a default name for a user-facing entity, produce something unique and identifiable rather than a generic placeholder.

```ts
// Bad
return firstLine?.trim() ?? "Untitled";

// Good
const uuid = crypto.randomUUID();
return firstLine?.trim() ?? `fragment-${uuid.substring(0, 8)}`;
```

---

## Formatting

### Blank lines between logical blocks

Separate distinct logical steps within a function with a blank line. This applies even to short functions — grouping related lines visually makes the intent clearer.

```ts
// Bad
export const createRegistryDatabase = (configDirectory: string) => {
  mkdirSync(configDirectory, { recursive: true });
  const database = new Database(join(configDirectory, "registry.db"));
  const registryDatabase = drizzle(database, { schema });
  migrate(registryDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });
  return registryDatabase;
};

// Good
export const createRegistryDatabase = (configDirectory: string) => {
  mkdirSync(configDirectory, { recursive: true });

  const database = new Database(join(configDirectory, "registry.db"));
  const registryDatabase = drizzle(database, { schema });

  migrate(registryDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });

  return registryDatabase;
};
```

---

## Conditionals

### Prefer optional chaining over explicit `!== undefined` checks

```ts
// Bad
if (match && match[1] !== undefined && match[2] !== undefined) { ... }

// Good
if (match?.[1] && match?.[2]) { ... }
```

### Prefer `!!` / `!` over `> 0` / `=== 0` for length checks

```ts
// Bad
if (Object.keys(fields).length > 0) { ... }
if (result.length === 0) { ... }

// Good
if (!!Object.keys(fields).length) { ... }
if (!result.length) { ... }
```

---

## Database migrations

### Use descriptive, date-prefixed migration filenames

Name migration files `YYYYMMDD_description.sql` rather than accepting auto-generated names. Auto-generated names (e.g. `0000_rare_norman_osborn`) carry no semantic meaning.

```
// Bad
0000_rare_norman_osborn.sql

// Good
20260404_create_projects_table.sql
```

---

## Comments

### Mark known limitations with `// TODO:`

When a piece of code is deliberately incomplete, inefficient, or has a known future requirement, leave a `// TODO:` comment explaining what needs to change and why.

```ts
// TODO: this should use an internal database to avoid having to read all fragments
const all = await listMarkdownFiles(path("fragments"));
```
