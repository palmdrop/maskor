import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  cpSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createRegistryDatabase } from "../db/registry";
import { createVaultIndexer } from "../indexer/indexer";
import {
  MASKOR_DB_AUTO_RESET_ENV,
  classifySchemaState,
  computeSchemaFingerprint,
  resetDatabaseIfSchemaDrifted,
} from "../db/schema-fingerprint";
import { BASIC_VAULT } from "@maskor/test-fixtures";

const vaultMigrationsFolder = join(import.meta.dir, "..", "db", "vault", "migrations");
const registryMigrationsFolder = join(import.meta.dir, "..", "db", "registry", "migrations");

let tmpDir: string;
let vaultDir: string;
let priorFlag: string | undefined;

const vaultDbPath = () => join(vaultDir, ".maskor", "vault.db");

// Raw helpers — deliberately avoid the app schema so the test marks/observes drift independently
// of any table definition.
const setUserVersion = (value: number): void => {
  const database = new Database(vaultDbPath());
  database.exec(`PRAGMA user_version = ${value}`);
  database.close();
};

const readUserVersion = (): number => {
  const database = new Database(vaultDbPath(), { readonly: true });
  const row = database.query("PRAGMA user_version").get() as { user_version: number };
  database.close();
  return row.user_version;
};

const writeMarker = (): void => {
  const database = new Database(vaultDbPath());
  database.exec("CREATE TABLE IF NOT EXISTS _test_marker (x INTEGER)");
  database.close();
};

const markerExists = (): boolean => {
  const database = new Database(vaultDbPath(), { readonly: true });
  const row = database
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_test_marker'")
    .get();
  database.close();
  return row !== null;
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-fingerprint-test-"));
  vaultDir = join(tmpDir, "vault");
  priorFlag = process.env[MASKOR_DB_AUTO_RESET_ENV];
  delete process.env[MASKOR_DB_AUTO_RESET_ENV];
});

afterEach(() => {
  if (priorFlag === undefined) delete process.env[MASKOR_DB_AUTO_RESET_ENV];
  else process.env[MASKOR_DB_AUTO_RESET_ENV] = priorFlag;
  rmSync(tmpDir, { recursive: true, force: true });
});

// Build a minimal migrations folder (journal + one `.sql` per entry) so we can mutate the
// migration set the way `db:generate` would and observe the fingerprint / reset reacting to it —
// the real-world trigger, not an artificially-stamped `user_version`.
const writeMigrationsFolder = (folder: string, tags: string[]): void => {
  mkdirSync(join(folder, "meta"), { recursive: true });
  const entries = tags.map((tag, index) => ({
    idx: index,
    version: "7",
    when: 1700000000000 + index,
    tag,
    breakpoints: true,
  }));
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", entries }));
  for (const tag of tags) {
    writeFileSync(join(folder, `${tag}.sql`), `CREATE TABLE ${tag.replace(/\W/g, "_")} (x);`);
  }
};

describe("computeSchemaFingerprint", () => {
  it("is deterministic for a given migration set", () => {
    expect(computeSchemaFingerprint(vaultMigrationsFolder)).toBe(
      computeSchemaFingerprint(vaultMigrationsFolder),
    );
  });

  it("changes when a migration is added (the db:generate workflow)", () => {
    const folder = join(tmpDir, "migrations");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);
    const before = computeSchemaFingerprint(folder);

    writeMigrationsFolder(folder, ["0001_init", "0002_more", "0003_new_column"]);
    const after = computeSchemaFingerprint(folder);

    expect(after).not.toBe(before);
  });

  it("changes when an already-applied migration's SQL is amended in place", () => {
    const folder = join(tmpDir, "migrations-amend");
    writeMigrationsFolder(folder, ["0001_init"]);
    const before = computeSchemaFingerprint(folder);

    // Same journal/tag, different SQL body — the amend case migrate() cannot reconcile.
    writeFileSync(join(folder, "0001_init.sql"), "CREATE TABLE init_amended (x, y);");
    const after = computeSchemaFingerprint(folder);

    expect(after).not.toBe(before);
  });

  it("fits the positive 31-bit range required by PRAGMA user_version", () => {
    const fingerprint = computeSchemaFingerprint(vaultMigrationsFolder);
    expect(fingerprint).toBeGreaterThan(0);
    expect(fingerprint).toBeLessThanOrEqual(0x7fffffff);
  });
});

describe("createVaultDatabase schema fingerprint stamping", () => {
  it("stamps the current fingerprint into a freshly created DB", () => {
    createVaultDatabase(vaultDir);
    expect(readUserVersion()).toBe(computeSchemaFingerprint(vaultMigrationsFolder));
  });
});

describe("resetDatabaseIfSchemaDrifted — migration-set change is the real trigger", () => {
  // Stamp a standalone sqlite DB with a given user_version (a fingerprint).
  const stamp = (path: string, fingerprint: number): void => {
    const database = new Database(path);
    database.exec(`PRAGMA user_version = ${fingerprint}`);
    database.close();
  };

  it("does NOT reset when a migration is appended — migrate() applies it forward (flag set)", () => {
    const folder = join(tmpDir, "migrations-forward");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);

    const dbPath = join(tmpDir, "forward.db");
    // DB built and stamped against the original 2-migration set.
    stamp(dbPath, computeSchemaFingerprint(folder));

    // db:generate appends a migration — a forward-only change migrate() can apply in place.
    writeMigrationsFolder(folder, ["0001_init", "0002_more", "0003_new_column"]);

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    const didReset = resetDatabaseIfSchemaDrifted(dbPath, folder, "vault");

    expect(didReset).toBe(false);
    expect(existsSync(dbPath)).toBe(true); // preserved — migrate() applies 0003, data survives
  });

  it("resets when an already-applied migration is amended in place (flag set)", () => {
    const folder = join(tmpDir, "migrations-amend-reset");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);

    const dbPath = join(tmpDir, "amend.db");
    stamp(dbPath, computeSchemaFingerprint(folder));

    // Same tags/journal, but 0001's SQL body changes — migrate() can't reconcile this.
    writeFileSync(join(folder, "0001_init.sql"), "CREATE TABLE init_amended (x, y);");

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    const didReset = resetDatabaseIfSchemaDrifted(dbPath, folder, "vault");

    expect(didReset).toBe(true);
    expect(existsSync(dbPath)).toBe(false);
  });

  it("resets when a previously-applied migration is removed (flag set)", () => {
    const folder = join(tmpDir, "migrations-remove");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);

    const dbPath = join(tmpDir, "remove.db");
    stamp(dbPath, computeSchemaFingerprint(folder));

    // 0002 dropped — the stamp is no longer a prefix of the current set.
    writeMigrationsFolder(folder, ["0001_init"]);

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    const didReset = resetDatabaseIfSchemaDrifted(dbPath, folder, "vault");

    expect(didReset).toBe(true);
    expect(existsSync(dbPath)).toBe(false);
  });

  it("does not reset when the migration set is unchanged (flag set)", () => {
    const folder = join(tmpDir, "migrations-stable");
    writeMigrationsFolder(folder, ["0001_init"]);

    const dbPath = join(tmpDir, "stable.db");
    stamp(dbPath, computeSchemaFingerprint(folder));

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    const didReset = resetDatabaseIfSchemaDrifted(dbPath, folder, "vault");

    expect(didReset).toBe(false);
    expect(existsSync(dbPath)).toBe(true);
  });

  it("does not reset on a migration change when the flag is unset", () => {
    const folder = join(tmpDir, "migrations-flagoff");
    writeMigrationsFolder(folder, ["0001_init"]);

    const dbPath = join(tmpDir, "flagoff.db");
    stamp(dbPath, computeSchemaFingerprint(folder));
    writeMigrationsFolder(folder, ["0001_init", "0002_added"]);

    // Flag unset (default).
    const didReset = resetDatabaseIfSchemaDrifted(dbPath, folder, "vault");

    expect(didReset).toBe(false);
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe("classifySchemaState", () => {
  const stamp = (path: string, fingerprint: number): void => {
    const database = new Database(path);
    database.exec(`PRAGMA user_version = ${fingerprint}`);
    database.close();
  };

  it("is 'absent' when the DB file does not exist", () => {
    const folder = join(tmpDir, "migrations-absent");
    writeMigrationsFolder(folder, ["0001_init"]);
    expect(classifySchemaState(join(tmpDir, "nope.db"), folder)).toBe("absent");
  });

  it("is 'match' when the stamp equals the current migration set", () => {
    const folder = join(tmpDir, "migrations-match");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);
    const dbPath = join(tmpDir, "match.db");
    stamp(dbPath, computeSchemaFingerprint(folder));
    expect(classifySchemaState(dbPath, folder)).toBe("match");
  });

  it("is 'forward' when the stamp equals a proper prefix (migrations appended)", () => {
    const folder = join(tmpDir, "migrations-fwd");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);
    const dbPath = join(tmpDir, "fwd.db");
    stamp(dbPath, computeSchemaFingerprint(folder));
    writeMigrationsFolder(folder, ["0001_init", "0002_more", "0003_new"]);
    expect(classifySchemaState(dbPath, folder)).toBe("forward");
  });

  it("is 'drift' when an already-applied migration is amended", () => {
    const folder = join(tmpDir, "migrations-drift-amend");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);
    const dbPath = join(tmpDir, "drift-amend.db");
    stamp(dbPath, computeSchemaFingerprint(folder));
    writeFileSync(join(folder, "0001_init.sql"), "CREATE TABLE init_amended (x, y);");
    expect(classifySchemaState(dbPath, folder)).toBe("drift");
  });

  it("is 'drift' for an unrelated stamp that matches no prefix", () => {
    const folder = join(tmpDir, "migrations-drift-unrelated");
    writeMigrationsFolder(folder, ["0001_init", "0002_more"]);
    const dbPath = join(tmpDir, "drift-unrelated.db");
    stamp(dbPath, 999);
    expect(classifySchemaState(dbPath, folder)).toBe("drift");
  });
});

describe("createVaultDatabase auto-reset", () => {
  it("does not reset a matching DB when the flag is set (data preserved)", () => {
    createVaultDatabase(vaultDir);
    writeMarker();
    expect(markerExists()).toBe(true);

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    createVaultDatabase(vaultDir);

    expect(markerExists()).toBe(true);
  });

  it("resets a drifted DB when the flag is set (data discarded)", () => {
    createVaultDatabase(vaultDir);
    writeMarker();
    setUserVersion(999); // simulate a schema change the live DB never picked up

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    createVaultDatabase(vaultDir);

    expect(existsSync(vaultDbPath())).toBe(true);
    expect(markerExists()).toBe(false);
    // The recreated DB is re-stamped with the current fingerprint.
    expect(readUserVersion()).toBe(computeSchemaFingerprint(vaultMigrationsFolder));
  });

  it("does not reset a drifted DB when the flag is unset (default behavior)", () => {
    createVaultDatabase(vaultDir);
    writeMarker();
    setUserVersion(999);

    // Flag unset (default) — drift is ignored, DB is left untouched.
    createVaultDatabase(vaultDir);

    expect(markerExists()).toBe(true);
    // Unstamped: the stale fingerprint is preserved so a later flag-on run still detects drift.
    expect(readUserVersion()).toBe(999);
  });

  // Invariant (never-lose-writing, Phase 5): a DB reset drops vault.db (+ WAL/SHM) only — it MUST
  // NOT touch `.maskor/swap/`, the transient unsaved-content crash net. `.maskor/` is declared
  // freely overwritable, so this guards a silent future regression where a reset wipes work in flight.
  it("leaves the unsaved-content swap files untouched when it resets a drifted DB", () => {
    createVaultDatabase(vaultDir);
    writeMarker();

    const swapFile = join(vaultDir, ".maskor", "swap", "fragment", "open-fragment.json");
    mkdirSync(join(vaultDir, ".maskor", "swap", "fragment"), { recursive: true });
    const swapPayload = JSON.stringify({ content: "in-progress unsaved edits", savedAt: "now" });
    writeFileSync(swapFile, swapPayload);

    setUserVersion(999); // simulate drift
    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    createVaultDatabase(vaultDir);

    // The DB was reset (marker gone) but the swap survived intact.
    expect(markerExists()).toBe(false);
    expect(existsSync(swapFile)).toBe(true);
    expect(readFileSync(swapFile, "utf8")).toBe(swapPayload);
  });

  it("treats an unreadable DB file as drift and recreates it when the flag is set", () => {
    createVaultDatabase(vaultDir);
    // Clobber the DB with garbage — a half-failed migration can leave a file that isn't valid
    // SQLite. Reading its fingerprint would throw; the reset should heal it instead of crashing.
    writeFileSync(vaultDbPath(), "not a sqlite database");

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    expect(() => createVaultDatabase(vaultDir)).not.toThrow();

    expect(existsSync(vaultDbPath())).toBe(true);
    expect(readUserVersion()).toBe(computeSchemaFingerprint(vaultMigrationsFolder));
  });

  it("re-derives vault data after a reset (reset → rebuild repopulates the index)", async () => {
    // The startup path resets inside createVaultDatabase, then rebuilds in the same flow
    // (resolveProject → index.rebuild → getVaultDatabase). Mirror that cycle here.
    cpSync(BASIC_VAULT, vaultDir, { recursive: true });

    const vault = createVault({ root: vaultDir });
    const populated = await createVaultIndexer(createVaultDatabase(vaultDir), vault).rebuild();
    expect(populated.fragments).toBeGreaterThan(0);

    setUserVersion(999); // simulate schema drift the live DB never picked up
    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";

    // Fresh wrappers, as a new process would create — createVaultDatabase resets the drifted DB.
    const rebuilt = await createVaultIndexer(
      createVaultDatabase(vaultDir),
      createVault({ root: vaultDir }),
    ).rebuild();

    expect(rebuilt.fragments).toBe(populated.fragments);
    expect(rebuilt.aspects).toBe(populated.aspects);
    expect(rebuilt.notes).toBe(populated.notes);
    expect(rebuilt.references).toBe(populated.references);
    expect(rebuilt.sequences).toBe(populated.sequences);
  });
});

describe("createRegistryDatabase schema fingerprint", () => {
  const configDir = () => join(tmpDir, "config");
  const registryDbPath = () => join(configDir(), "registry.db");

  const readRegistryUserVersion = (): number => {
    const database = new Database(registryDbPath(), { readonly: true });
    const row = database.query("PRAGMA user_version").get() as { user_version: number };
    database.close();
    return row.user_version;
  };

  const setRegistryUserVersion = (value: number): void => {
    const database = new Database(registryDbPath());
    database.exec(`PRAGMA user_version = ${value}`);
    database.close();
  };

  const writeRegistryMarker = (): void => {
    const database = new Database(registryDbPath());
    database.exec("CREATE TABLE IF NOT EXISTS _test_marker (x INTEGER)");
    database.close();
  };

  const registryMarkerExists = (): boolean => {
    const database = new Database(registryDbPath(), { readonly: true });
    const row = database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_test_marker'")
      .get();
    database.close();
    return row !== null;
  };

  it("stamps the current fingerprint into a freshly created registry DB", () => {
    createRegistryDatabase(configDir());
    expect(readRegistryUserVersion()).toBe(computeSchemaFingerprint(registryMigrationsFolder));
  });

  it("resets a drifted registry DB when the flag is set (project registry discarded)", () => {
    createRegistryDatabase(configDir());
    writeRegistryMarker();
    setRegistryUserVersion(999); // simulate a schema change the live DB never picked up

    process.env[MASKOR_DB_AUTO_RESET_ENV] = "1";
    createRegistryDatabase(configDir());

    expect(existsSync(registryDbPath())).toBe(true);
    expect(registryMarkerExists()).toBe(false);
    expect(readRegistryUserVersion()).toBe(computeSchemaFingerprint(registryMigrationsFolder));
  });

  it("does not reset a drifted registry DB when the flag is unset (default behavior)", () => {
    createRegistryDatabase(configDir());
    writeRegistryMarker();
    setRegistryUserVersion(999);

    createRegistryDatabase(configDir());

    expect(registryMarkerExists()).toBe(true);
    expect(readRegistryUserVersion()).toBe(999);
  });
});
