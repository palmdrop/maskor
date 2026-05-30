import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Typography from "@tiptap/extension-typography";

// Single source of the Tiptap config shared by the editable `ProseEditor` and
// the read-only `ReadonlyProse` renderer, so the two cannot drift. `html` stays
// false everywhere: raw HTML in content renders as escaped text, never executed.
//
// Returned as a factory because Tiptap extension instances should not be shared
// across editors created from the same module-level array.
export const buildSharedProseExtensions = () => [
  StarterKit,
  Markdown.configure({ html: false, transformPastedText: true }),
  Typography,
];

// The base prose typography classes. Each editor appends its own surface-specific
// utilities (focus ring, min-height, padding).
export const proseClassName = "prose prose-stone dark:prose-invert max-w-none";
