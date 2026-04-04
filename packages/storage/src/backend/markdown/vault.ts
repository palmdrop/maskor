import type { Aspect, Fragment, FragmentUUID, Logger, Note, Reference } from "@maskor/shared";
import { slugify } from "@maskor/shared";
import type { Vault, VaultConfig } from "../types";
import { VaultError } from "../types";
import { parseFile } from "./parse";
import { serializeFile } from "./serialize";
import * as fragmentMapper from "./mappers/fragment";
import * as aspectMapper from "./mappers/aspect";
import * as noteMapper from "./mappers/note";
import * as referenceMapper from "./mappers/reference";
import { initFragment } from "./init";
import { rename, unlink } from "node:fs/promises";
import { join, basename, sep } from "node:path";

// --- helpers ---

const readMarkdown = async (filePath: string): Promise<string> => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new VaultError("FILE_NOT_FOUND", `File not found: "${filePath}"`, {
      filePath,
      reason: "File does not exist or was removed before read",
    });
  }
  return file.text();
};

const writeMarkdown = async (filePath: string, content: string): Promise<void> => {
  await Bun.write(filePath, content);
};

// --- factory ---

export const createVault = (config: VaultConfig): Vault => {
  const path = (...parts: string[]) => join(config.root, ...parts);
  const log: Logger =
    config.logger?.child({ module: "vault" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  const listMarkdownFiles = async (directory: string): Promise<string[]> => {
    const glob = new Bun.Glob("*.md");
    const entries: string[] = [];
    try {
      for await (const file of glob.scan({ cwd: directory, onlyFiles: true })) {
        entries.push(join(directory, file));
      }
    } catch (err) {
      log.error(
        { directory, errMessage: err instanceof Error ? err.message : String(err) },
        "failed to list markdown files in directory",
      );
      return [];
    }
    return entries;
  };

  return {
    fragments: {
      async read(filePath) {
        const raw = await readMarkdown(filePath);
        const parsed = parseFile(raw);
        const discardedDirectory = path("fragments", "discarded");
        const isDiscarded = filePath.startsWith(discardedDirectory + sep);

        if (isDiscarded && parsed.frontmatter.pool !== "discarded") {
          log.warn(
            { filePath, frontmatterPool: parsed.frontmatter.pool },
            "pool/folder conflict: fragment in discarded/ but frontmatter pool is not discarded — overriding",
          );
        }
        if (!isDiscarded && parsed.frontmatter.pool === "discarded") {
          log.warn(
            { filePath, frontmatterPool: parsed.frontmatter.pool },
            "pool/folder conflict: fragment has pool=discarded but is not in discarded/ — pool not overridden",
          );
        }

        return fragmentMapper.fromFile(parsed, filePath, isDiscarded ? "discarded" : undefined);
      },

      async readAll() {
        const active = await listMarkdownFiles(path("fragments"));
        const discarded = await listMarkdownFiles(path("fragments", "discarded"));
        // TODO: batch read?
        return Promise.all([...active, ...discarded].map((file) => this.read(file)));
      },

      async write(fragment) {
        const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
        const slug = slugify(fragment.title);
        const directory =
          fragment.pool === "discarded" ? path("fragments", "discarded") : path("fragments");
        const filePath = join(directory, `${slug}.md`);
        await writeMarkdown(filePath, serializeFile({ frontmatter, inlineFields, body }));
        log.debug({ filePath }, "fragment written");
      },

      async discard(uuid: FragmentUUID) {
        // TODO: this should use an internal database to avoid having to read all fragments
        const all = await listMarkdownFiles(path("fragments"));
        for (const filePath of all) {
          const raw = await readMarkdown(filePath);
          const parsed = parseFile(raw);
          if (parsed.frontmatter.uuid !== uuid) continue;

          const slug = slugify(
            typeof parsed.frontmatter.title === "string"
              ? parsed.frontmatter.title
              : basename(filePath).replace(/\.md$/, ""),
          );
          const destination = path("fragments", "discarded", `${slug}.md`);

          try {
            await rename(filePath, destination);
          } catch (cause) {
            throw new VaultError(
              "FILE_MOVE_FAILED",
              `Failed to move fragment "${uuid}" to discarded/`,
              { filePath, uuid, reason: "fs.rename failed" },
              { cause },
            );
          }

          const discardedFragment = {
            ...fragmentMapper.fromFile(parsed, filePath),
            pool: "discarded" as const,
          };
          const { frontmatter, inlineFields, body } = fragmentMapper.toFile(discardedFragment);
          const updated = serializeFile({ frontmatter, inlineFields, body });
          await writeMarkdown(destination, updated);

          log.info({ uuid, filePath, destination }, "fragment discarded");
          return;
        }

        throw new VaultError("FRAGMENT_NOT_FOUND", `Cannot discard: fragment "${uuid}" not found`, {
          uuid,
          reason: "UUID not present in any file under fragments/",
        });
      },
    },

    aspects: {
      async read(filePath) {
        const raw = await readMarkdown(filePath);
        return aspectMapper.fromFile(parseFile(raw));
      },

      async readAll() {
        const files = await listMarkdownFiles(path("aspects"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async write(aspect: Aspect) {
        const { frontmatter, body } = aspectMapper.toFile(aspect);
        const filePath = path("aspects", `${slugify(aspect.key)}.md`);
        await writeMarkdown(filePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath }, "aspect written");
      },
    },

    notes: {
      async read(filePath) {
        const raw = await readMarkdown(filePath);
        return noteMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(path("notes"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async write(note: Note) {
        const { frontmatter, body } = noteMapper.toFile(note);
        const filePath = path("notes", `${slugify(note.title)}.md`);
        await writeMarkdown(filePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath }, "note written");
      },
    },

    references: {
      async read(filePath) {
        const raw = await readMarkdown(filePath);
        return referenceMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(path("references"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async write(reference: Reference) {
        const { frontmatter, body } = referenceMapper.toFile(reference);
        const filePath = path("references", `${slugify(reference.name)}.md`);
        await writeMarkdown(filePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath }, "reference written");
      },
    },

    pieces: {
      async consumeAll() {
        const files = await listMarkdownFiles(path("pieces"));
        const results: Fragment[] = [];

        for (const filePath of files) {
          try {
            const content = await Bun.file(filePath).text();
            const title = basename(filePath).replace(/\.md$/, "");
            const fragment = await initFragment(config, { title, content });
            results.push(fragment);

            try {
              await unlink(filePath);
            } catch (cause) {
              throw new VaultError(
                "FILE_DELETE_FAILED",
                `Failed to delete piece file "${filePath}" after consuming`,
                { filePath, reason: "fs.unlink failed" },
                { cause },
              );
            }

            log.info({ filePath, fragmentTitle: fragment.title }, "piece consumed");
          } catch (err) {
            log.error(
              {
                filePath,
                errCode: err instanceof VaultError ? err.code : undefined,
                errMessage: err instanceof Error ? err.message : String(err),
              },
              "failed to consume piece — skipping",
            );
          }
        }

        return results;
      },
    },
  };
};
