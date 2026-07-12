import type { OrphanWarning } from "./assemble-markdown";

// Lean navigation payload — the structure that drives the sidebar. It carries
// no fragment content (the content lives entirely in the assembled markdown
// string), only stable ids and display keys for navigation.
export type NavFragment = {
  uuid: string;
  key: string;
};

export type NavSection = {
  uuid: string;
  name: string;
  fragments: NavFragment[];
};

export type AssembledDocument = {
  markdown: string;
  sections: NavSection[];
};

// The result of an annotation-aware export assembly. `markdown` is the md/txt
// footnote form; `docxMarkdown` retains comment markers for the Word-comment
// lowering, which reads `commentBodies` (`{ markerId → comment body }`, including
// synthetic notes markers). `warnings` lists fragments with skipped orphaned
// comments.
export type ExportAssembly = {
  markdown: string;
  docxMarkdown: string;
  commentBodies: Record<string, string>;
  warnings: OrphanWarning[];
  sections: NavSection[];
};
