# Styling Setup — Tailwind v4 + shadcn/ui + Editorial Theme

**Date**: 14-04-2026
**Status**: Done
**Implemented At**: 15-04-2026

---

## Goal

Set up a modern, fully owned styling system with an editorial/paper aesthetic. No external services at runtime. All code lives in the repo.

---

## Stack

| Layer       | Tool                                      | How it's used                        |
| ----------- | ----------------------------------------- | ------------------------------------ |
| Utility CSS | Tailwind CSS v4                           | Utility classes, grid layout         |
| Components  | shadcn/ui (Radix)                         | Accessible primitives — owned source |
| Prose       | @tailwindcss/typography                   | Fragment/note rendering              |
| Theme       | Hand-written CSS variables                | Zero-radius, serif body, no shadows  |
| Fonts       | Google Fonts (self-hosted via fontsource) | No tracking, full ownership          |
| Preview     | Ladle                                     | Lightweight component story browser  |

---

## Phase 1 — Install Tailwind v4

In `packages/frontend`:

```bash
bun add tailwindcss @tailwindcss/vite
bun add @tailwindcss/typography
```

Update `vite.config.ts` to add the Tailwind plugin:

```ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...
});
```

In `src/styles/global.css`, replace existing contents with a Tailwind v4 entry:

```css
@import "tailwindcss";
@import "@tailwindcss/typography";
```

No `tailwind.config.js` needed in v4 — configuration lives in CSS via `@theme {}`.

---

## Phase 2 — Editorial Theme (CSS variables)

Add a `@theme {}` block to `global.css`. Goals: zero radius, serif body, monospace UI chrome, flat/no shadows, high contrast.

```css
@theme {
  /* Typography */
  --font-sans: "IBM Plex Mono", ui-monospace, monospace; /* UI chrome */
  --font-serif: "EB Garamond", "Libre Baskerville", Georgia, serif; /* Body/prose */
  --font-mono: "IBM Plex Mono", monospace;

  /* Radius — flat, no rounding */
  --radius: 0rem;
  --radius-sm: 0rem;
  --radius-md: 0rem;
  --radius-lg: 0rem;

  /* Shadows — none */
  --shadow-sm: none;
  --shadow: none;
  --shadow-md: none;
  --shadow-lg: none;

  /* Colors — paper/ink palette (light mode baseline) */
  --color-background: oklch(0.98 0 0); /* near-white paper */
  --color-foreground: oklch(0.1 0 0); /* near-black ink */
  --color-muted: oklch(0.92 0 0); /* light rule/divider */
  --color-muted-foreground: oklch(0.45 0 0); /* secondary text */
  --color-border: oklch(0.8 0 0); /* column rules */
  --color-primary: oklch(0.1 0 0); /* primary action = ink */
  --color-primary-foreground: oklch(0.98 0 0);
}
```

**Fonts — self-hosted via fontsource (no Google Fonts CDN tracking):**

```bash
bun add @fontsource/eb-garamond @fontsource/ibm-plex-mono
```

Import in `global.css`:

```css
@import "@fontsource/eb-garamond/400.css";
@import "@fontsource/eb-garamond/400-italic.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";
```

---

## Phase 3 — shadcn/ui Setup

```bash
bunx shadcn@latest init
```

When prompted:

- Style: `default` (we override the theme above, so this matters less)
- Base color: `neutral`
- CSS variables: `yes`

shadcn scaffolds into `src/components/ui/`. All files are owned — edit freely.

The `components.json` config in the root points to your component path. Add components as needed:

```bash
bunx shadcn@latest add button dialog dropdown-menu tooltip separator
```

**Note:** shadcn ships with rounded corners and shadows baked into component classnames (e.g. `rounded-md`). After init, do a one-time pass on the generated components to strip `rounded-*` and `shadow-*` utilities — or override them globally in `@theme` (simpler, already done in Phase 2).

---

## Phase 4 — Component Preview with Ladle

[Ladle](https://ladle.dev/) is a lightweight Storybook alternative. Vite-native, zero config for Vite projects, runs stories in the same environment as the app.

```bash
bun add -D @ladle/react
```

Add script to `packages/frontend/package.json`:

```json
"ladle": "ladle serve",
"ladle:build": "ladle build"
```

Create `src/components/ui/button.stories.tsx`:

```tsx
import type { Story } from "@ladle/react";
import { Button } from "./button";

export const Default: Story = () => <Button>Label</Button>;
export const Ghost: Story = () => <Button variant="ghost">Ghost</Button>;
```

Ladle picks up all `*.stories.tsx` files automatically. Run with `bun run ladle`.

**Why Ladle over Storybook:**

- No config files, no webpack, no addons ecosystem to maintain
- Vite-native — same build pipeline as the app
- Bun-compatible out of the box
- Sufficient for a solo project — Storybook's scale is overkill here

**Alternative (zero tooling):** Add a `/dev` route in the router that renders component variants inline. Works, but loses isolation and hot-reload ergonomics.

---

## Phase 5 — Prose Layer for Fragment Rendering

For note/fragment content rendered as HTML, use the typography plugin. Override the default serif styles in `global.css`:

```css
@layer base {
  .prose {
    --tw-prose-body: var(--color-foreground);
    --tw-prose-headings: var(--color-foreground);
    --tw-prose-links: var(--color-foreground);
    --tw-prose-bold: var(--color-foreground);
    --tw-prose-code: var(--color-foreground);
    --tw-prose-quotes: var(--color-muted-foreground);
    font-family: var(--font-serif);
  }
}
```

Apply with `className="prose"` on any rendered markdown container.

---

## File Changes Summary

| File                                                | Change                                          |
| --------------------------------------------------- | ----------------------------------------------- |
| `packages/frontend/vite.config.ts`                  | Add `@tailwindcss/vite` plugin                  |
| `packages/frontend/src/styles/global.css`           | Replace with Tailwind v4 entry + `@theme` block |
| `packages/frontend/package.json`                    | Add Tailwind, shadcn deps, fontsource, Ladle    |
| `packages/frontend/src/components/ui/`              | Scaffolded by shadcn CLI                        |
| `packages/frontend/components.json`                 | shadcn config (auto-generated)                  |
| `packages/frontend/src/components/ui/*.stories.tsx` | Ladle stories per component                     |

---

## Notes & Risks

- **tweakcn**: Can be used one-time to visually explore the `@theme` token values before committing. Output is plain CSS — paste into `global.css`, no ongoing dependency.
- **shadcn component rounding**: The generated component files hardcode `rounded-md` etc. Setting `--radius: 0` in `@theme` overrides the CSS variable, but any hardcoded Tailwind class (`rounded-md`) will still apply. Strip those from generated files or add a global override: `* { border-radius: 0 !important; }` as a blunt instrument during dev.
- **Tailwind v4 + Bun**: Well-documented combination. The `@tailwindcss/vite` plugin is the correct integration path (not PostCSS).
- **Dark mode**: Not planned here. Add later with `@media (prefers-color-scheme: dark)` inside `@theme` using `@variant dark { ... }`.
