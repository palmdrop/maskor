import { eq } from "drizzle-orm";
import { join } from "node:path";
import { stat, mkdir } from "node:fs/promises";
import type { ProjectUUID, UserUUID } from "@maskor/shared";
import type { RegistryDatabase } from "../db";
import { projectsTable } from "../db/schema";
import { ProjectNotFoundError } from "./errors";
import { LOCAL_USER_UUID, type ProjectRecord } from "./types";

const toProjectRecord = (row: typeof projectsTable.$inferSelect): ProjectRecord => {
  const { uuid, userUuid, ...rest } = row;
  return {
    ...rest,
    projectUUID: uuid as ProjectUUID,
    userUUID: userUuid as UserUUID,
  };
};

const writeVaultManifest = async (
  vaultPath: string,
  projectUUID: ProjectUUID,
  name: string,
): Promise<void> => {
  const maskorDirectory = join(vaultPath, ".maskor");
  await mkdir(maskorDirectory, { recursive: true });
  await Bun.write(
    join(maskorDirectory, "project.json"),
    JSON.stringify({ projectUUID, name, registeredAt: new Date().toISOString() }, null, 2),
  );
};

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
      const projectUUID = crypto.randomUUID() as ProjectUUID;

      // Write manifest first: if DB insert fails after a successful manifest write, the worst case
      // is a stale manifest file — far less harmful than a ghost DB record with no manifest.
      await writeVaultManifest(vaultPath, projectUUID, name);

      const [row] = await database
        .insert(projectsTable)
        .values({
          uuid: projectUUID,
          userUuid: LOCAL_USER_UUID,
          name,
          vaultPath,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!row) {
        throw new Error(`Failed to register project "${name}" at "${vaultPath}"`);
      }

      return toProjectRecord(row);
    },

    async listProjects(): Promise<ProjectRecord[]> {
      const rows = await database.select().from(projectsTable);
      return rows.map(toProjectRecord);
    },

    async findByUUID(projectUUID: ProjectUUID): Promise<ProjectRecord | null> {
      const rows = await database
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUUID))
        .limit(1);

      return rows[0] ? toProjectRecord(rows[0]) : null;
    },

    async removeProject(projectUUID: ProjectUUID): Promise<void> {
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
