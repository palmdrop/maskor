export const LOCAL_USER_UUID = "local";

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
    readyStatusThreshold: number;
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
