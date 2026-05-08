export const LOCAL_USER_UUID = "local";

export type ProjectRecord = {
  projectUUID: string;
  userUUID: string;
  name: string;
  vaultPath: string;
  editor: {
    vimMode: boolean;
    rawMarkdownMode: boolean;
  };
  suggestion: {
    readyStatusThreshold: number;
  };
  advanced: {
    showFragmentStats: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectContext = {
  userUUID: string;
  projectUUID: string;
  vaultPath: string;
};
