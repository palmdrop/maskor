import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, existsSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createRegistryDatabase } from "../db/registry";
import { createVaultIndexer } from "../indexer/indexer";
import { MASKOR_DB_AUTO_RESET_ENV, computeSchemaFingerprint } from "../db/schema-fingerprint";
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

describe("computeSchemaFingerprint", () => {
  it("is deterministic for a given migration set", () => {
    expect(computeSchemaFingerprint(vaultMigrationsFolder)).toBe(
      computeSchemaFingerprint(vaultMigrationsFolder),
    );
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
