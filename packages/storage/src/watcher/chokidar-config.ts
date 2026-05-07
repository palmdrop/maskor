export const createChokidarConfig = (vaultRoot: string) => ({
  watched: vaultRoot,
  // Ignore dot files and directories (.maskor/, .obsidian/).
  ignored: /(^|[/\\])\..+/,
  persistent: true,
  // Startup sync is handled by rebuild() — ignore initial scan.
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
});
