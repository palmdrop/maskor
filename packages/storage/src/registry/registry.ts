import { eq } from "drizzle-orm";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import type { ProjectUUID } from "@maskor/shared";
import type { RegistryDatabase } from "../db";
import { projectsTable } from "../db/schema";
import { LOCAL_USER_UUID, type ProjectRecord } from "./types";

const toProjectRecord = (row: typeof projectsTable.$inferSelect): ProjectRecord => {
  return {
    projectUUID: row.uuid as ProjectUUID,
    userUUID: row.userUuid as typeof LOCAL_USER_UUID,
    name: row.name,
    vaultPath: row.vaultPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const writeVaultManifest = async (
  vaultPath: string,
  projectUUID: ProjectUUID,
  name: string,
): Promise<void> => {
  const maskorDirectory = join(vaultPath, ".maskor");
  await Bun.write(
    join(maskorDirectory, "project.json"),
    JSON.stringify({ projectUUID, name, registeredAt: new Date().toISOString() }, null, 2),
  );
};

export const createProjectRegistry = (database: RegistryDatabase) => {
  return {
    async registerProject(name: string, vaultPath: string): Promise<ProjectRecord> {
      const vaultStat = await stat(vaultPath).catch(() => null);
      if (!vaultStat?.isDirectory()) {
        throw new Error(`Vault path does not exist or is not a directory: "${vaultPath}"`);
      }

      const now = new Date();
      const projectUUID = crypto.randomUUID() as ProjectUUID;

      await database.insert(projectsTable).values({
        uuid: projectUUID,
        userUuid: LOCAL_USER_UUID,
        name,
        vaultPath,
        createdAt: now,
        updatedAt: now,
      });

      await writeVaultManifest(vaultPath, projectUUID, name);

      return {
        projectUUID,
        userUUID: LOCAL_USER_UUID,
        name,
        vaultPath,
        createdAt: now,
        updatedAt: now,
      };
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
      await database.delete(projectsTable).where(eq(projectsTable.uuid, projectUUID));
    },
  };
};

export type ProjectRegistry = ReturnType<typeof createProjectRegistry>;
