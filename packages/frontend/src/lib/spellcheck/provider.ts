import { EditorView, type Extension } from "@uiw/react-codemirror";

// A resolved BCP-47 writing language, or the empty string for "no explicit language" (defer to the
// browser/OS default). Produced by `resolveLanguage` (@maskor/shared) from the project + fragment.
export type ResolvedLanguage = string;

// The swap seam between the editor and whatever actually performs spell-checking. The editor depends
// only on this interface, never on `spellcheck`/`lang` attributes directly. The `native` implementation
// below leans on the browser's built-in spell-checker; a future `bundled` implementation (nspell /
// hunspell dictionaries + decorations) can replace it without re-plumbing the language config, which
// matters because native webview spell-check is unreliable across a Tauri port (WebKitGTK/WKWebView).
export interface SpellProvider {
  // HTML attributes applied to the rich (Tiptap/ProseMirror) editor's contenteditable host.
  proseAttributes(language: ResolvedLanguage): Record<string, string>;
  // A CodeMirror extension enabling spell-check on the raw/vim editor for the given language. CM6 hard-
  // sets `spellcheck: "false"`, so this overrides it via `EditorView.contentAttributes`.
  codeMirrorExtension(language: ResolvedLanguage): Extension;
}

// Always enable spell-check; attach `lang` only when a concrete language is set (an empty language
// leaves the browser to pick its default dictionary rather than forcing a possibly-wrong one).
const spellAttributes = (language: ResolvedLanguage): Record<string, string> => ({
  spellcheck: "true",
  ...(language ? { lang: language } : {}),
});

export const nativeSpellProvider: SpellProvider = {
  proseAttributes: spellAttributes,
  codeMirrorExtension: (language) => EditorView.contentAttributes.of(spellAttributes(language)),
};

// The active provider. Swap this single binding to change engines project-wide.
export const spellProvider: SpellProvider = nativeSpellProvider;
