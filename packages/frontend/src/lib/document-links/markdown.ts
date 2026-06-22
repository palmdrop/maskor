// tiptap-markdown serializes text nodes through prosemirror-markdown, which escapes markdown specials
// (`[`, `]`, `_`, `*`, …) with a backslash. A document link is plain text in the rich editor, so a
// `[[type/key]]` link serializes as `\[\[type/key\]\]` (and a key containing `_`/`*` gets those
// escaped too). That backslash-mangled form corrupts the vault file and breaks link parsing on the
// next read. Collapse the escapes back inside every `[[…]]` span so the canonical link text round-trips
// cleanly. Already-clean links don't match the escaped pattern, so this is idempotent.
const ESCAPED_LINK = /\\\[\\\[(.*?)\\\]\\\]/g;
const BACKSLASH_ESCAPE = /\\([\\`*_~[\]{}()#+\-.!|>])/g;

export const unescapeDocumentLinks = (markdown: string): string =>
  markdown.replace(ESCAPED_LINK, (_match, inner: string) => {
    const unescaped = inner.replace(BACKSLASH_ESCAPE, "$1");
    return `[[${unescaped}]]`;
  });
