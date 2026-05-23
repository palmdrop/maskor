export const LOCAL_USER_UUID = "local";

// TODO: couldn't this be inferred from the schema?
export type ProjectRecord = {
  projectUUID: string;
  userUUID: string;
  name: string;
  vaultPath: string;
  editor: {
    vimMode: boolean;
    rawMarkdownMode: boolean;
    fontSize: number;
    maxParagraphWidth: number;
  };
  suggestion: {
    readinessThreshold: number;
    currentFragmentUUID?: string;
  };
  advanced: {
    showFragmentStats: boolean;
  };
  preview: {
    showTitles: boolean;
    showSectionHeadings: boolean;
    separator: "blank-line" | "horizontal-rule" | "none";
  };
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectContext = {
  userUUID: string;
  projectUUID: string;
  vaultPath: string;
};
