// TODO: constants management?

// TODO: figure out how to handle session

export const db = {
  getFilePath: (_uuid: string) => {
    // TODO: perform db query
    if (_uuid.length < 16) throw new Error("Invalid UUID"); // DUMMY error for now
    return "/path/to/file/on/disk";
  },

  getFilePaths: (uuids: string[]) => {
    return uuids.map((uuid) => {
      return {
        uuid,
        path: `/path/to/file/on/disk/${uuid}`,
      };
    });
  },
};
