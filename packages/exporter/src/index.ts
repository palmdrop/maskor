export {
  assembleSequence,
  assembleSequenceForExport,
  assemblePieces,
  type ImportPiece,
  type FragmentAnnotations,
  type SequenceAnnotations,
} from "./assemble";
export {
  assembleMarkdown,
  assembleAnnotated,
  type AssemblyBlock,
  type AssemblyOptions,
  type AssemblySeparator,
  type AssemblyMode,
  type AssemblyResult,
  type BlockAnnotations,
  type CommentAnnotation,
  type ReferenceAnnotation,
  type OrphanWarning,
} from "./assemble-markdown";
export type { AssembledDocument, ExportAssembly, NavSection, NavFragment } from "./types";
export {
  renderExport,
  type ExportFormat,
  type ExportRenderInput,
  type RenderedExport,
} from "./render-export";
export { markdownToDocx, type MarkdownToDocxOptions } from "./markdown-to-docx";
// The anchor-sentinel protocol lives in `@maskor/shared/sentinel` — the single
// definition shared by this emitter and the frontend parser. Import it directly
// from there rather than through this barrel.
