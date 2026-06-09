export { assembleSequence, assemblePieces, type ImportPiece } from "./assemble";
export {
  assembleMarkdown,
  type AssemblyBlock,
  type AssemblyOptions,
  type AssemblySeparator,
} from "./assemble-markdown";
export type { AssembledDocument, NavSection, NavFragment } from "./types";
export { renderExport, type ExportFormat, type RenderedExport } from "./render-export";
export { markdownToDocx } from "./markdown-to-docx";
// The anchor-sentinel protocol lives in `@maskor/shared/sentinel` — the single
// definition shared by this emitter and the frontend parser. Import it directly
// from there rather than through this barrel.
