import { eq } from "drizzle-orm";
import { join } from "node:path";
import { stat, mkdir } from "node:fs/promises";
import type { RegistryDatabase } from "../db/registry";
import { projectsTable } from "../db/registry/schema";
import { ProjectNotFoundError } from "./errors";
import { LOCAL_USER_UUID, type ProjectRecord } from "./types";

type ProjectManifest = {
  projectUUID: string;
  name: string;
  registeredAt: string;
  config?: {
    editor?: {
      vimMode?: boolean;
      rawMarkdownMode?: boolean;
    };
  };
};

const manifestPath = (vaultPath: string) => join(vaultPath, ".maskor", "project.json");

const readVaultManifest = async (vaultPath: string): Promise<ProjectManifest | null> => {
  const file = Bun.file(manifestPath(vaultPath));
  if (!(await file.exists())) return null;
  return file.json() as Promise<ProjectManifest>;
};

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

  const updated: ProjectManifest = {
    ...existing,
    ...patch,
    config: {
      ...existing.config,
      ...patch.config,
      editor: {
        ...existing.config?.editor,
        ...patch.config?.editor,
      },
    },
  };

  await Bun.write(manifestPath(vaultPath), JSON.stringify(updated, null, 2));
};

const toProjectRecord = (
  row: typeof projectsTable.$inferSelect,
  manifest: ProjectManifest | null,
): ProjectRecord => ({
  projectUUID: row.uuid,
  userUUID: row.userUuid,
  name: manifest?.name ?? "",
  vaultPath: row.vaultPath,
  editor: {
    vimMode: manifest?.config?.editor?.vimMode ?? false,
    rawMarkdownMode: manifest?.config?.editor?.rawMarkdownMode ?? false,
  },
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// TODO: manifest-based DB recovery is not yet implemented — if the registry DB is lost,
// the .maskor/project.json manifests cannot currently be used to re-register projects.
export const createProjectRegistry = (database: RegistryDatabase) => {
  return {
    async registerProject(name: string, vaultPath: string): Promise<ProjectRecord> {
      // TODO: Bun.file().exists() cannot distinguish file vs directory — keeping node:fs/promises stat
      const vaultStat = await stat(vaultPath).catch(() => null);
      if (!vaultStat?.isDirectory()) {
        throw new Error(`Vault path does not exist or is not a directory: "${vaultPath}"`);
      }

      const now = new Date();
      const projectUUID = crypto.randomUUID();

      // Write manifest first: if DB insert fails after a successful manifest write, the worst case
      // is a stale manifest file — far less harmful than a ghost DB record with no manifest.
      // Only write default editor config when no config already exists — preserves config if the
      // vault is being re-registered after a DB loss, but still initialises defaults on first use.
      const existingManifest = await readVaultManifest(vaultPath);
      await writeVaultManifest(vaultPath, {
        projectUUID,
        name,
        registeredAt: now.toISOString(),
        ...(existingManifest?.config ? {} : { config: { editor: { vimMode: false, rawMarkdownMode: false } } }),
      });

      const [row] = await database
        .insert(projectsTable)
        .values({
          uuid: projectUUID,
          userUuid: LOCAL_USER_UUID,
          vaultPath,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

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

    async updateProject(
      projectUUID: string,
      patch: { name?: string; editor?: { vimMode?: boolean; rawMarkdownMode?: boolean } },
    ): Promise<ProjectRecord> {
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
      if (patch.editor !== undefined) manifestPatch.config = { editor: patch.editor };

      await writeVaultManifest(row.vaultPath, manifestPatch);

      const [updatedRow] = await database
        .update(projectsTable)
        .set({ updatedAt: new Date() })
        .where(eq(projectsTable.uuid, projectUUID))
        .returning();

      const manifest = await readVaultManifest(row.vaultPath);
      return toProjectRecord(updatedRow ?? row, manifest);
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
