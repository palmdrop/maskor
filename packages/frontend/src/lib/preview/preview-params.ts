import {
  ProjectPreviewSeparator,
  type GetAssembledSequenceParams,
  type ProjectUpdatePreviewSeparator as SeparatorType,
} from "@api/generated/maskorAPI.schemas";

export type PreviewConfig = {
  showTitles: boolean;
  showSectionHeadings: boolean;
  separator: SeparatorType;
};

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  showTitles: false,
  showSectionHeadings: true,
  separator: ProjectPreviewSeparator["blank-line"],
};

// The assembled-sequence query is driven by the preview toggles: flipping one
// changes the query key and refetches the re-assembled markdown. Shared between
// PreviewPage (live config) and the route loader (server config) so the loader
// prefetches the exact key the component will read.
export const buildPreviewParams = (preview: PreviewConfig): GetAssembledSequenceParams => ({
  showTitles: preview.showTitles ? "true" : "false",
  showSectionHeadings: preview.showSectionHeadings ? "true" : "false",
  separator: preview.separator,
});
