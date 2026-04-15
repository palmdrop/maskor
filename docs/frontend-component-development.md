# Frontend Component Development

**Stack:** Tailwind v4 · shadcn/ui (Radix Nova) · Ladle · IBM Plex Mono + EB Garamond

---

## Folder layout

```
packages/frontend/src/
├── components/
│   └── ui/          ← shadcn-generated primitives (owned source, edit freely)
├── lib/
│   └── utils.ts     ← cn() helper (clsx + tailwind-merge)
├── styles/
│   └── global.css   ← theme root: @theme, :root tokens, prose overrides
└── hooks/           ← shared React hooks
```

---

## 1. The `cn()` helper

Every component uses `cn()` to merge Tailwind classes safely:

```tsx
import { cn } from "@/lib/utils";

<div className={cn("base-class", isActive && "text-primary", className)} />;
```

`cn` runs `clsx` first (handles conditionals, arrays) then `twMerge` (resolves conflicts, e.g. `text-sm text-lg` → `text-lg`). Always pipe user-supplied `className` through it.

---

## 2. Using shadcn primitives

Primitives live in `src/components/ui/`. They are owned source — copy-pasted from the registry, not imported from a package. Edit them directly.

```tsx
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function Toolbar() {
  return (
    <div className="flex gap-2">
      <Button>Save</Button>
      <Button variant="ghost">Cancel</Button>
      <Separator orientation="vertical" />
      <Button variant="destructive" size="sm">
        Delete
      </Button>
    </div>
  );
}
```

Available variants for `Button`: `default` · `outline` · `secondary` · `ghost` · `destructive` · `link`  
Available sizes: `default` · `xs` · `sm` · `lg` · `icon` · `icon-xs` · `icon-sm` · `icon-lg`

### Adding more components

```bash
bunx shadcn@latest add <name>
# e.g.:
bunx shadcn@latest add input select badge
```

The file lands in `src/components/ui/`. Commit it like any other source file.

---

## 3. Building custom components

### Pattern: extend a primitive

Use `asChild` when you need a component to render as a different element (e.g. a link styled as a button):

```tsx
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

<Button asChild>
  <Link to="/fragments">Open</Link>
</Button>;
```

### Pattern: variant-driven component with `cva`

For components with multiple visual states, use `class-variance-authority` (already installed):

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center border px-2 py-0.5 text-xs font-mono", {
  variants: {
    status: {
      draft: "border-border text-muted-foreground",
      published: "border-primary bg-primary text-primary-foreground",
    },
  },
  defaultVariants: { status: "draft" },
});

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function StatusBadge({ status, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ status }), className)} {...props} />;
}
```

---

## 4. Theme tokens

Tokens are defined in two places in `src/styles/global.css`:

| Block              | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `@theme {}`        | Tailwind token definitions — fonts, radius, shadows            |
| `:root {}`         | CSS custom properties for shadcn components — colors, spacing  |
| `@theme inline {}` | Bridges `:root` vars to Tailwind tokens (auto-wired by shadcn) |

**Consuming tokens in components:**

```tsx
// Via Tailwind utilities (preferred)
<div className="bg-background text-foreground border-border" />
<p className="font-serif text-muted-foreground" />

// Via CSS variables (for inline styles or non-Tailwind contexts)
<div style={{ color: "var(--foreground)" }} />
```

**Core palette (light mode):**

| Token              | Value            | Use                      |
| ------------------ | ---------------- | ------------------------ |
| `background`       | near-white paper | page/card backgrounds    |
| `foreground`       | near-black ink   | body text                |
| `muted`            | light grey       | subtle backgrounds       |
| `muted-foreground` | mid grey         | secondary text, captions |
| `border`           | light rule       | dividers, outlines       |
| `primary`          | near-black ink   | primary actions          |
| `destructive`      | red              | delete/danger actions    |

**Typography:**

```tsx
// UI chrome — monospace (IBM Plex Mono, the default font-sans)
<span className="font-sans text-sm" />

// Prose / reading content — serif (EB Garamond)
<article className="font-serif prose" />
```

---

## 5. Prose rendering

For fragment/note content rendered from markdown HTML, apply the `prose` class:

```tsx
<div className="prose" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
```

The `prose` class is configured in `global.css` to use EB Garamond and the ink/paper palette — no additional configuration needed.

---

## 6. Previewing components with Storybook

Run Storybook alongside the dev server:

```bash
bun run storybook    # http://localhost:6006
```

Config lives in `.storybook/main.ts` (story glob, framework) and `.storybook/preview.ts` (global CSS imports, default parameters).

### Writing a story

Create a `*.stories.tsx` file next to the component. Use the `StoryObj` format (CSF3):

```tsx
// src/components/ui/separator.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta: Meta<typeof Separator> = {
  component: Separator,
};

export default meta;

type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <span className="font-sans text-sm">Above</span>
      <Separator />
      <span className="font-sans text-sm">Below</span>
    </div>
  ),
};
```

Storybook picks up all `*.stories.@(ts|tsx)` files under `src/` automatically.

---

## 7. Running checks

```bash
bun run typecheck    # tsc --noEmit
bun run test         # vitest run
bun run build        # full production build — catches CSS/Tailwind errors
```

Run all three after any non-trivial component change.
