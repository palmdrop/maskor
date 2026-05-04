import type { Aspect, Fragment, Logger, Note, Reference } from "@maskor/shared";
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
import { join, basename, sep, resolve } from "node:path";

// --- helpers ---

const readMarkdown = async (absolutePath: string): Promise<string> => {
  const file = Bun.file(absolutePath);
  if (!(await file.exists())) {
    throw new VaultError("FILE_NOT_FOUND", `File not found: "${absolutePath}"`, {
      filePath: absolutePath,
      reason: "File does not exist or was removed before read",
    });
  }
  return file.text();
};

const writeMarkdown = async (absolutePath: string, content: string): Promise<void> => {
  await Bun.write(absolutePath, content);
};

// --- factory ---

export const createVault = (config: VaultConfig): Vault => {
  const vaultPath = (...parts: string[]) => join(config.root, ...parts);

  // Returns a resolver that converts entity-relative paths to absolute, guarded to stay
  // within the given entity directory. Throws PATH_OUT_OF_BOUNDS on traversal attempts.
  const makeToAbsolute =
    (absoluteEntityDir: string) =>
    (relativePath: string): string => {
      const absolutePath = resolve(join(absoluteEntityDir, relativePath));
      if (!absolutePath.startsWith(absoluteEntityDir + sep)) {
        throw new VaultError(
          "PATH_OUT_OF_BOUNDS",
          `Path escapes entity directory: "${relativePath}"`,
          { filePath: relativePath, reason: "Resolved path is outside entity directory" },
        );
      }
      return absolutePath;
    };

  const toAbsoluteFragment = makeToAbsolute(resolve(vaultPath("fragments")));
  const toAbsoluteAspect = makeToAbsolute(resolve(vaultPath("aspects")));
  const toAbsoluteNote = makeToAbsolute(resolve(vaultPath("notes")));
  const toAbsoluteReference = makeToAbsolute(resolve(vaultPath("references")));
  const toAbsolutePiece = makeToAbsolute(resolve(vaultPath("pieces")));

  const log: Logger =
    config.logger?.child({ module: "vault" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  // Returns filenames relative to absoluteDirectory (e.g. "the-bridge.md", not a full path).
  const listMarkdownFiles = async (absoluteDirectory: string): Promise<string[]> => {
    const glob = new Bun.Glob("*.md");
    const entries: string[] = [];

    try {
      for await (const fileName of glob.scan({ cwd: absoluteDirectory, onlyFiles: true })) {
        entries.push(fileName);
      }
    } catch (error) {
      log.error(
        {
          directory: absoluteDirectory,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "failed to list markdown files in directory",
      );
      return [];
    }

    return entries;
  };

  return {
    root: config.root,
    fragments: {
      // filePath is relative to the fragments/ directory.
      // Active fragments: "the-bridge.md"
      // Discarded fragments: "discarded/the-bridge.md"
      async read(filePath) {
        const absolutePath = toAbsoluteFragment(filePath);
        const raw = await readMarkdown(absolutePath);
        const parsed = parseFile(raw);
        return fragmentMapper.fromFile(parsed, filePath);
      },

      async readAll() {
        const active = await listMarkdownFiles(vaultPath("fragments"));
        const discardedFiles = await listMarkdownFiles(vaultPath("fragments", "discarded"));
        const discarded = discardedFiles.map((fileName) => join("discarded", fileName));
        // TODO: batch read?
        return Promise.all([...active, ...discarded].map((filePath) => this.read(filePath)));
      },

      async readAllWithFilePaths() {
        const active = await listMarkdownFiles(vaultPath("fragments"));
        const discardedFiles = await listMarkdownFiles(vaultPath("fragments", "discarded"));
        const discarded = discardedFiles.map((fileName) => join("discarded", fileName));
        return Promise.all(
          [...active, ...discarded].map(async (filePath) => {
            const absolutePath = toAbsoluteFragment(filePath);
            const rawContent = await readMarkdown(absolutePath);
            const parsed = parseFile(rawContent);
            const entity = fragmentMapper.fromFile(parsed, filePath);
            return { entity, filePath, rawContent };
          }),
        );
      },

      async write(fragment) {
        const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
        const slug = slugify(fragment.title);
        const absoluteFilePath = fragment.isDiscarded
          ? toAbsoluteFragment(join("discarded", `${slug}.md`))
          : toAbsoluteFragment(`${slug}.md`);

        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, inlineFields, body }));
        log.debug({ filePath: basename(absoluteFilePath) }, "fragment written");
      },

      async discard(filePath: string) {
        const absoluteSource = toAbsoluteFragment(filePath);
        const raw = await readMarkdown(absoluteSource);
        const parsed = parseFile(raw);

        const slug = slugify(
          typeof parsed.frontmatter.title === "string"
            ? parsed.frontmatter.title
            : basename(filePath).replace(/\.md$/, ""),
        );
        const relativeDestination = join("discarded", `${slug}.md`);
        const absoluteDestination = toAbsoluteFragment(relativeDestination);

        try {
          await rename(absoluteSource, absoluteDestination);
        } catch (cause) {
          throw new VaultError(
            "FILE_MOVE_FAILED",
            `Failed to move fragment to discarded/`,
            { filePath, reason: "fs.rename failed" },
            { cause },
          );
        }

        log.info({ filePath, destination: relativeDestination }, "fragment discarded");
      },

      async restore(filePath: string) {
        const absoluteSource = toAbsoluteFragment(filePath);
        const raw = await readMarkdown(absoluteSource);
        const parsed = parseFile(raw);

        const slug = slugify(
          typeof parsed.frontmatter.title === "string"
            ? parsed.frontmatter.title
            : basename(filePath).replace(/\.md$/, ""),
        );
        const relativeDestination = `${slug}.md`;
        const absoluteDestination = toAbsoluteFragment(relativeDestination);

        try {
          await rename(absoluteSource, absoluteDestination);
        } catch (cause) {
          throw new VaultError(
            "FILE_MOVE_FAILED",
            `Failed to move fragment out of discarded/`,
            { filePath, reason: "fs.rename failed" },
            { cause },
          );
        }

        log.info({ filePath, destination: relativeDestination }, "fragment restored");
      },
    },

    aspects: {
      async read(filePath) {
        const absolutePath = toAbsoluteAspect(filePath);
        const raw = await readMarkdown(absolutePath);
        return aspectMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(vaultPath("aspects"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths() {
        const files = await listMarkdownFiles(vaultPath("aspects"));
        return Promise.all(
          files.map(async (filePath) => {
            const absolutePath = toAbsoluteAspect(filePath);
            const rawContent = await readMarkdown(absolutePath);
            const entity = aspectMapper.fromFile(parseFile(rawContent), filePath);
            return { entity, filePath, rawContent };
          }),
        );
      },

      async write(aspect: Aspect) {
        const { frontmatter, body } = aspectMapper.toFile(aspect);
        const absoluteFilePath = toAbsoluteAspect(`${aspect.key}.md`);

        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: basename(absoluteFilePath) }, "aspect written");
      },

      async delete(filePath: string) {
        const absolutePath = toAbsoluteAspect(filePath);
        try {
          await unlink(absolutePath);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            throw new VaultError(
              "FILE_NOT_FOUND",
              `Aspect file not found: ${filePath}`,
              {
                filePath,
              },
              { cause },
            );
          }
          throw cause;
        }
        log.debug({ filePath }, "aspect deleted");
      },
    },

    notes: {
      async read(filePath) {
        const absolutePath = toAbsoluteNote(filePath);
        const raw = await readMarkdown(absolutePath);
        return noteMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(vaultPath("notes"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths() {
        const files = await listMarkdownFiles(vaultPath("notes"));
        return Promise.all(
          files.map(async (filePath) => {
            const absolutePath = toAbsoluteNote(filePath);
            const rawContent = await readMarkdown(absolutePath);
            const entity = noteMapper.fromFile(parseFile(rawContent), filePath);
            return { entity, filePath, rawContent };
          }),
        );
      },

      async write(note: Note) {
        const { frontmatter, body } = noteMapper.toFile(note);
        const absoluteFilePath = toAbsoluteNote(`${note.key}.md`);

        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: basename(absoluteFilePath) }, "note written");
      },

      async delete(filePath: string) {
        const absolutePath = toAbsoluteNote(filePath);
        try {
          await unlink(absolutePath);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            throw new VaultError(
              "FILE_NOT_FOUND",
              `Note file not found: ${filePath}`,
              { filePath },
              { cause },
            );
          }
          throw cause;
        }
        log.debug({ filePath }, "note deleted");
      },
    },

    references: {
      async read(filePath) {
        const absolutePath = toAbsoluteReference(filePath);
        const raw = await readMarkdown(absolutePath);
        return referenceMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(vaultPath("references"));
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths() {
        const files = await listMarkdownFiles(vaultPath("references"));
        return Promise.all(
          files.map(async (filePath) => {
            const absolutePath = toAbsoluteReference(filePath);
            const rawContent = await readMarkdown(absolutePath);
            const entity = referenceMapper.fromFile(parseFile(rawContent), filePath);
            return { entity, filePath, rawContent };
          }),
        );
      },

      async write(reference: Reference) {
        const { frontmatter, body } = referenceMapper.toFile(reference);
        const absoluteFilePath = toAbsoluteReference(`${reference.key}.md`);

        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: basename(absoluteFilePath) }, "reference written");
      },

      async delete(filePath: string) {
        const absolutePath = toAbsoluteReference(filePath);
        try {
          await unlink(absolutePath);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            throw new VaultError(
              "FILE_NOT_FOUND",
              `Reference file not found: ${filePath}`,
              {
                filePath,
              },
              { cause },
            );
          }
          throw cause;
        }
        log.debug({ filePath }, "reference deleted");
      },
    },

    pieces: {
      async consume(filePath: string) {
        const absolutePath = toAbsolutePiece(filePath);
        if (!(await Bun.file(absolutePath).exists())) return null;

        const content = await Bun.file(absolutePath).text();
        const title = basename(filePath).replace(/\.md$/, "");
        const fragment = await initFragment(config, { title, content });

        const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
        const absoluteFragmentPath = toAbsoluteFragment(`${slugify(fragment.title)}.md`);
        await writeMarkdown(
          absoluteFragmentPath,
          serializeFile({ frontmatter, inlineFields, body }),
        );

        try {
          await unlink(absolutePath);
        } catch (cause) {
          throw new VaultError(
            "FILE_DELETE_FAILED",
            `Failed to delete piece file "${filePath}" after consuming`,
            { filePath, reason: "fs.unlink failed" },
            { cause },
          );
        }

        log.info({ filePath, fragmentTitle: fragment.title }, "piece consumed");
        return fragment;
      },

      async consumeAll() {
        const files = await listMarkdownFiles(vaultPath("pieces"));
        const results: Fragment[] = [];

        for (const fileName of files) {
          try {
            const absolutePath = toAbsolutePiece(fileName);
            const content = await Bun.file(absolutePath).text();
            const title = fileName.replace(/\.md$/, "");
            const fragment = await initFragment(config, { title, content });

            // Write the fragment to fragments/ so the watcher can re-read it for hashing.
            const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
            const absoluteFragmentPath = toAbsoluteFragment(`${slugify(fragment.title)}.md`);
            await writeMarkdown(
              absoluteFragmentPath,
              serializeFile({ frontmatter, inlineFields, body }),
            );

            results.push(fragment);

            try {
              await unlink(absolutePath);
            } catch (cause) {
              throw new VaultError(
                "FILE_DELETE_FAILED",
                `Failed to delete piece file "${fileName}" after consuming`,
                { filePath: fileName, reason: "fs.unlink failed" },
                { cause },
              );
            }

            log.info({ filePath: fileName, fragmentTitle: fragment.title }, "piece consumed");
          } catch (error) {
            log.error(
              {
                filePath: fileName,
                errorCode: error instanceof VaultError ? error.code : undefined,
                errorMessage: error instanceof Error ? error.message : String(error),
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
