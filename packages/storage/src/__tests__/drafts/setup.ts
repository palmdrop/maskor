import { cpSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BASIC_VAULT } from "@maskor/test-fixtures";
import { createVaultDatabase } from "../../db/vault";
import { createVault } from "../../vault/markdown";
import { createVaultIndexer } from "../../indexer/indexer";

export type DraftTestVault = {
  vaultPath: string;
  vaultDatabase: ReturnType<typeof createVaultDatabase>;
  cleanup: () => void;
};

export const setupDraftVault = async (): Promise<DraftTestVault> => {
  const tmpDir = mkdtempSync(join(tmpdir(), "maskor-drafts-test-"));
  const vaultPath = join(tmpDir, "vault");
  cpSync(BASIC_VAULT, vaultPath, { recursive: true });

  // Seed an action-log and project.json so restore tests can assert
  // they are preserved across a restore.
  mkdirSync(join(vaultPath, ".maskor"), { recursive: true });
  writeFileSync(
    join(vaultPath, ".maskor", "action-log.jsonl"),
    '{"id":"seed","timestamp":"2026-01-01T00:00:00Z","type":"fragment:created","actor":"user","target":{"type":"fragment","uuid":"f1"},"payload":{},"undoable":false}\n',
    "utf8",
  );
  writeFileSync(
    join(vaultPath, ".maskor", "project.json"),
    JSON.stringify({ name: "live", marker: "should-be-preserved" }, null, 2),
    "utf8",
  );

  const vault = createVault({ root: vaultPath });
  const vaultDatabase = createVaultDatabase(vaultPath);
  const indexer = createVaultIndexer(vaultDatabase, vault);
  await indexer.rebuild();

  return {
    vaultPath,
    vaultDatabase,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
};
