import { eq, and, ne } from "drizzle-orm";
import { join } from "node:path";
import { stat, mkdir } from "node:fs/promises";
import type { RegistryDatabase } from "../db/registry";
import { ensureVaultSkeleton } from "../utils/vault-skeleton";
import { projectsTable } from "../db/registry/schema";
import {
  ProjectNotFoundError,
  ProjectConflictError,
  VaultUUIDConflictError,
  ExistingVaultManifestError,
} from "./errors";
import { LOCAL_USER_UUID, type ProjectRecord } from "./types";
import type { ProjectUpdate } from "@maskor/shared";

type ProjectManifest = {
  projectUUID: string;
  name: string;
  registeredAt: string;
  config?: Omit<ProjectUpdate, "name">;
};

const manifestPath = (vaultPath: string) => join(vaultPath, ".maskor", "project.json");

const readVaultManifest = async (vaultPath: string): Promise<ProjectManifest | null> => {
  const file = Bun.file(manifestPath(vaultPath));
  if (!(await file.exists())) return null;
  return file.json() as Promise<ProjectManifest>;
};

// Keys of the nested config sections in ProjectManifest. Extracted here so that
// writeVaultManifest performs a deep merge over all of them without enumerating
// them twice.
const CONFIG_SECTION_KEYS = ["editor", "suggestion", "advanced", "preview", "overview"] as const;
type ConfigSection = (typeof CONFIG_SECTION_KEYS)[number];

const writeVaultManifest = async (
  vaultPath: string,
  patch: Partial<ProjectManifest> & { config?: Partial<ProjectManifest["config"]> },
): Promise<void> => {
  const maskorDirectory = join(vaultPath, ".maskor");
  await mkdir(maskorDirectory, { recursive: true });

  const existing = (await readVaultManifest(vaultPath)) ?? {
    projectUUID: "",
    name: "",
    registeredAt: new Date().toISOString(),
  };

  const mergedSections = Object.fromEntries(
    CONFIG_SECTION_KEYS.map((key) => [
      key,
      { ...existing.config?.[key as ConfigSection], ...patch.config?.[key as ConfigSection] },
    ]),
  );

  const updated: ProjectManifest = {
    ...existing,
    ...patch,
    config: { ...existing.config, ...patch.config, ...mergedSections },
  };

  await Bun.write(manifestPath(vaultPath), JSON.stringify(updated, null, 2));
};

const PROJECT_CONFIG_DEFAULTS = {
  editor: { vimMode: false, rawMarkdownMode: false, fontSize: 16, maxParagraphWidth: 72 },
  suggestion: { readinessThreshold: 0.95 },
  advanced: { showFragmentStats: false },
  preview: { showTitles: false, showSectionHeadings: true, separator: "blank-line" as const },
  overview: { density: "full" as const },
};

const toProjectRecord = (
  row: typeof projectsTable.$inferSelect,
  manifest: ProjectManifest | null,
): ProjectRecord => {
  const config = manifest?.config;
  return {
    projectUUID: row.uuid,
    userUUID: row.userUuid,
    name: manifest?.name ?? "",
    vaultPath: row.vaultPath,
    editor: { ...PROJECT_CONFIG_DEFAULTS.editor, ...config?.editor },
    suggestion: { ...PROJECT_CONFIG_DEFAULTS.suggestion, ...config?.suggestion },
    advanced: { ...PROJECT_CONFIG_DEFAULTS.advanced, ...config?.advanced },
    preview: { ...PROJECT_CONFIG_DEFAULTS.preview, ...config?.preview },
    overview: { ...PROJECT_CONFIG_DEFAULTS.overview, ...config?.overview },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const createProjectRegistry = (database: RegistryDatabase) => {
  return {
    async registerProject(
      name: string,
      vaultPath: string,
      mode: "adopt" | "create",
    ): Promise<ProjectRecord> {
      const now = new Date();
      let projectUUID: string;

      if (mode === "adopt") {
        // Bun.file().exists() cannot distinguish file vs directory — keeping node:fs/promises stat
        const vaultStat = await stat(vaultPath).catch(() => null);
        if (!vaultStat?.isDirectory()) {
          throw new Error(`Vault path does not exist or is not a directory: "${vaultPath}"`);
        }

        const existingManifest = await readVaultManifest(vaultPath);
        projectUUID = existingManifest?.projectUUID ?? crypto.randomUUID();

        const effectiveName = name || existingManifest?.name || "";

        // Write manifest first: if DB insert fails after a successful manifest write, the worst
        // case is a stale manifest file — far less harmful than a ghost DB record with no manifest.
        // Only write default editor config when no config already exists — preserves config on
        // re-adopt after DB loss, but initialises defaults on first use.
        await writeVaultManifest(vaultPath, {
          projectUUID,
          name: effectiveName,
          registeredAt: now.toISOString(),
          ...(existingManifest?.config
            ? {}
            : {
                config: {
                  editor: PROJECT_CONFIG_DEFAULTS.editor,
                  suggestion: PROJECT_CONFIG_DEFAULTS.suggestion,
                },
              }),
        });
      } else {
        // Pre-check DB uniqueness before touching the filesystem: avoids leaving orphan dirs and
        // manifests if the insert would fail with a UNIQUE constraint on vault_path.
        const conflictingRow = await database
          .select({ uuid: projectsTable.uuid })
          .from(projectsTable)
          .where(eq(projectsTable.vaultPath, vaultPath))
          .limit(1);
        if (conflictingRow[0]) {
          throw new ProjectConflictError(vaultPath);
        }

        // create: mkdir -p vault + full skeleton, then write manifest
        await mkdir(vaultPath, { recursive: true });
        await ensureVaultSkeleton(vaultPath);

        const existingManifest = await readVaultManifest(vaultPath);
        if (existingManifest) {
          // An existing manifest means this folder was already initialized as a Maskor project.
          // The caller should use mode: "adopt" instead.
          throw new ExistingVaultManifestError(vaultPath);
        }

        projectUUID = crypto.randomUUID();
        await writeVaultManifest(vaultPath, {
          projectUUID,
          name,
          registeredAt: now.toISOString(),
          config: {
            editor: PROJECT_CONFIG_DEFAULTS.editor,
            suggestion: PROJECT_CONFIG_DEFAULTS.suggestion,
          },
        });
      }

      let row: typeof projectsTable.$inferSelect | undefined;
      try {
        const rows = await database
          .insert(projectsTable)
          .values({
            uuid: projectUUID,
            userUuid: LOCAL_USER_UUID,
            vaultPath,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        row = rows[0];
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed: projects.vault_path")
        ) {
          throw new ProjectConflictError(vaultPath);
        }
        throw error;
      }

      if (!row) {
        throw new Error(`Failed to register project "${name}" at "${vaultPath}"`);
      }

      const manifest = await readVaultManifest(vaultPath);
      return toProjectRecord(row, manifest);
    },

    async listProjects(): Promise<ProjectRecord[]> {
      const rows = await database.select().from(projectsTable);
      return Promise.all(
        rows.map(async (row) => {
          const manifest = await readVaultManifest(row.vaultPath);
          return toProjectRecord(row, manifest);
        }),
      );
    },

    async findByUUID(projectUUID: string): Promise<ProjectRecord | null> {
      const rows = await database
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUUID))
        .limit(1);

      if (!rows[0]) return null;

      const manifest = await readVaultManifest(rows[0].vaultPath);
      return toProjectRecord(rows[0], manifest);
    },

    async updateProject(projectUUID: string, patch: ProjectUpdate): Promise<ProjectRecord> {
      const rows = await database
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUUID))
        .limit(1);

      if (!rows[0]) {
        throw new ProjectNotFoundError(projectUUID);
      }

      const row = rows[0];

      const manifestPatch: Partial<ProjectManifest> = {};
      if (patch.name !== undefined) manifestPatch.name = patch.name;
      if (
        patch.editor !== undefined ||
        patch.suggestion !== undefined ||
        patch.advanced !== undefined ||
        patch.preview !== undefined ||
        patch.overview !== undefined
      ) {
        manifestPatch.config = {
          ...(patch.editor !== undefined ? { editor: patch.editor } : {}),
          ...(patch.suggestion !== undefined ? { suggestion: patch.suggestion } : {}),
          ...(patch.advanced !== undefined ? { advanced: patch.advanced } : {}),
          ...(patch.preview !== undefined ? { preview: patch.preview } : {}),
          ...(patch.overview !== undefined ? { overview: patch.overview } : {}),
        };
      }

      await writeVaultManifest(row.vaultPath, manifestPatch);

      const [updatedRow] = await database
        .update(projectsTable)
        .set({ updatedAt: new Date() })
        .where(eq(projectsTable.uuid, projectUUID))
        .returning();

      const manifest = await readVaultManifest(row.vaultPath);
      return toProjectRecord(updatedRow ?? row, manifest);
    },

    async updateVaultPath(
      projectUUID: string,
      newPath: string,
      forceOverride = false,
    ): Promise<ProjectRecord> {
      const rows = await database
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUUID))
        .limit(1);

      if (!rows[0]) {
        throw new ProjectNotFoundError(projectUUID);
      }

      const conflictRows = await database
        .select()
        .from(projectsTable)
        .where(and(eq(projectsTable.vaultPath, newPath), ne(projectsTable.uuid, projectUUID)))
        .limit(1);

      if (conflictRows[0]) {
        throw new ProjectConflictError(newPath);
      }

      const manifest = await readVaultManifest(newPath);
      if (manifest && manifest.projectUUID !== projectUUID) {
        if (!forceOverride) {
          throw new VaultUUIDConflictError(newPath, manifest.projectUUID);
        }
        await writeVaultManifest(newPath, { ...manifest, projectUUID });
      }

      const [updatedRow] = await database
        .update(projectsTable)
        .set({ vaultPath: newPath, updatedAt: new Date() })
        .where(eq(projectsTable.uuid, projectUUID))
        .returning();

      const updatedManifest = await readVaultManifest(newPath);
      return toProjectRecord(updatedRow ?? rows[0], updatedManifest);
    },

    async removeProject(projectUUID: string): Promise<void> {
      const result = await database
        .delete(projectsTable)
        .where(eq(projectsTable.uuid, projectUUID))
        .returning({ uuid: projectsTable.uuid });

      if (!result.length) {
        throw new ProjectNotFoundError(projectUUID);
      }
    },
  };
};

export type ProjectRegistry = ReturnType<typeof createProjectRegistry>;
