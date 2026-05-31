import type { Aspect, Note, Reference, Sequence } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { Vault, VaultConfig, WithFilePath } from "../types";
import { VaultError } from "../types";
import type { ParsedFile } from "./parse";
import { parseFile } from "./parse";
import { serializeFile } from "./serialize";
import { ensureUuid, writeBackFragmentFrontmatter } from "./adopt";
import * as fragmentMapper from "./mappers/fragment";
import * as aspectMapper from "./mappers/aspect";
import * as noteMapper from "./mappers/note";
import * as referenceMapper from "./mappers/reference";
import * as sequenceMapper from "./mappers/sequence";
import { rename, unlink, mkdir } from "node:fs/promises";
import { join, basename, sep, resolve } from "node:path";
import { joinCategoryPath } from "../../utils/category";

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

const readYaml = async (absolutePath: string): Promise<string> => {
  const file = Bun.file(absolutePath);
  if (!(await file.exists())) {
    throw new VaultError("FILE_NOT_FOUND", `File not found: "${absolutePath}"`, {
      filePath: absolutePath,
      reason: "File does not exist or was removed before read",
    });
  }
  return file.text();
};

const writeYaml = async (absolutePath: string, content: string): Promise<void> => {
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
  const sequencesDir = resolve(vaultPath(".maskor", "sequences"));
  const toAbsoluteSequence = makeToAbsolute(sequencesDir);

  const log: Logger =
    config.logger?.child({ module: "vault" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  // Returns paths relative to absoluteDirectory. With `recursive: true` paths may include
  // subdirectories (e.g. "places/london.md"); with `recursive: false` only top-level
  // filenames are returned (e.g. "the-bridge.md").
  // Scans a directory for files matching the glob. A missing directory yields an empty list
  // silently — Maskor adopts external vaults that may not yet contain every entity/.maskor dir,
  // and the watcher creates files lazily, so absence is normal rather than an error. Any other
  // failure (permissions, etc.) is logged and also yields an empty list.
  const scanFiles = async (
    pattern: string,
    absoluteDirectory: string,
    label: string,
  ): Promise<string[]> => {
    const glob = new Bun.Glob(pattern);
    const entries: string[] = [];

    try {
      for await (const fileName of glob.scan({ cwd: absoluteDirectory, onlyFiles: true })) {
        entries.push(fileName);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      log.error(
        {
          directory: absoluteDirectory,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        `failed to list ${label} files in directory`,
      );
      return [];
    }

    return entries;
  };

  const listMarkdownFiles = async (
    absoluteDirectory: string,
    { recursive = false }: { recursive?: boolean } = {},
  ): Promise<string[]> => {
    const entries = await scanFiles(recursive ? "**/*.md" : "*.md", absoluteDirectory, "markdown");
    // Normalize to POSIX separators so DB rows and derived categories stay portable.
    return entries.map((fileName) => fileName.split(sep).join("/"));
  };

  // Returns filenames relative to absoluteDirectory (e.g. "<uuid>.yaml", not a full path).
  const listYamlFiles = (absoluteDirectory: string): Promise<string[]> =>
    scanFiles("*.yaml", absoluteDirectory, "yaml");

  // Reads every markdown file under a keyed-entity subdir (aspects/notes/references). When
  // `adopt` is set, any file lacking Maskor metadata is canonicalized in place: a missing UUID is
  // minted and written back to frontmatter. Keyed entities need nothing beyond the UUID — their
  // read-time mappers default every other field. Adoption is opt-in because the write-back is a
  // side effect only the rebuild should perform; plain reads stay pure. The returned rawContent
  // reflects what is on disk after any writeback, so the indexer stores a contentHash the
  // hash-guard will match on the next watcher event.
  const readKeyedEntitiesWithFilePaths = async <TEntity extends { uuid: string }>(
    subdir: string,
    toAbsolute: (relativePath: string) => string,
    fromFile: (parsed: ParsedFile, filePath: string) => TEntity,
    label: string,
    adopt: boolean,
  ): Promise<Array<WithFilePath<TEntity>>> => {
    const files = await listMarkdownFiles(vaultPath(subdir), { recursive: true });
    return Promise.all(
      files.map(async (filePath) => {
        const absolutePath = toAbsolute(filePath);
        const rawContent = await readMarkdown(absolutePath);
        const parsed = parseFile(rawContent);
        if (!adopt) {
          return { entity: fromFile(parsed, filePath), filePath, rawContent };
        }

        const { rawContent: afterAdoption } = await ensureUuid(
          parsed,
          absolutePath,
          rawContent,
          log,
          label,
        );
        return { entity: fromFile(parsed, filePath), filePath, rawContent: afterAdoption };
      }),
    );
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

      async readAllWithFilePaths({ adopt = false }: { adopt?: boolean } = {}) {
        const active = await listMarkdownFiles(vaultPath("fragments"));
        const discardedFiles = await listMarkdownFiles(vaultPath("fragments", "discarded"));
        const discarded = discardedFiles.map((fileName) => join("discarded", fileName));
        return Promise.all(
          [...active, ...discarded].map(async (filePath) => {
            const absolutePath = toAbsoluteFragment(filePath);
            const rawContent = await readMarkdown(absolutePath);
            const parsed = parseFile(rawContent);
            if (!adopt) {
              return { entity: fragmentMapper.fromFile(parsed, filePath), filePath, rawContent };
            }

            // Mint the UUID in memory only (writeBack: false) — a freshly adopted fragment gets its
            // full canonical frontmatter written once below, so a UUID-only write here would be
            // immediately overwritten.
            const { wasAssigned } = await ensureUuid(
              parsed,
              absolutePath,
              rawContent,
              log,
              "fragment",
              {
                writeBack: false,
              },
            );
            if (!wasAssigned) {
              return { entity: fragmentMapper.fromFile(parsed, filePath), filePath, rawContent };
            }

            // Freshly adopted fragment: write back the full canonical frontmatter, mirroring the
            // watcher's adoption path. Reuse the returned fragment so the upsert's updatedAt matches
            // what was serialized to disk.
            const adopted = await writeBackFragmentFrontmatter(parsed, absolutePath, filePath);
            return { entity: adopted.fragment, filePath, rawContent: adopted.rawContent };
          }),
        );
      },

      async write(fragment) {
        const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
        const absoluteFilePath = fragment.isDiscarded
          ? toAbsoluteFragment(join("discarded", `${fragment.key}.md`))
          : toAbsoluteFragment(`${fragment.key}.md`);

        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, inlineFields, body }));
        log.debug({ filePath: basename(absoluteFilePath) }, "fragment written");
      },

      async discard(filePath: string) {
        const absoluteSource = toAbsoluteFragment(filePath);
        const key = basename(filePath).replace(/\.md$/, "");
        const relativeDestination = join("discarded", `${key}.md`);
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
        const key = basename(filePath).replace(/\.md$/, "");
        const relativeDestination = `${key}.md`;
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

      async delete(filePath: string) {
        const absolutePath = toAbsoluteFragment(filePath);
        try {
          await unlink(absolutePath);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            throw new VaultError(
              "FILE_NOT_FOUND",
              `Fragment file not found: ${filePath}`,
              { filePath },
              { cause },
            );
          }
          throw cause;
        }
        log.debug({ filePath }, "fragment deleted");
      },
    },

    aspects: {
      async read(filePath) {
        const absolutePath = toAbsoluteAspect(filePath);
        const raw = await readMarkdown(absolutePath);
        return aspectMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const files = await listMarkdownFiles(vaultPath("aspects"), { recursive: true });
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths({ adopt = false }: { adopt?: boolean } = {}) {
        return readKeyedEntitiesWithFilePaths(
          "aspects",
          toAbsoluteAspect,
          aspectMapper.fromFile,
          "aspect",
          adopt,
        );
      },

      async write(aspect: Aspect) {
        const { frontmatter, body } = aspectMapper.toFile(aspect);
        const entityRelativePath = joinCategoryPath(aspect.category, aspect.key);
        const absoluteFilePath = toAbsoluteAspect(entityRelativePath);

        if (aspect.category) {
          await mkdir(join(resolve(vaultPath("aspects")), aspect.category), { recursive: true });
        }
        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: entityRelativePath }, "aspect written");
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
        const files = await listMarkdownFiles(vaultPath("notes"), { recursive: true });
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths({ adopt = false }: { adopt?: boolean } = {}) {
        return readKeyedEntitiesWithFilePaths(
          "notes",
          toAbsoluteNote,
          noteMapper.fromFile,
          "note",
          adopt,
        );
      },

      async write(note: Note) {
        const { frontmatter, body } = noteMapper.toFile(note);
        const entityRelativePath = joinCategoryPath(note.category, note.key);
        const absoluteFilePath = toAbsoluteNote(entityRelativePath);

        if (note.category) {
          await mkdir(join(resolve(vaultPath("notes")), note.category), { recursive: true });
        }
        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: entityRelativePath }, "note written");
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
        const files = await listMarkdownFiles(vaultPath("references"), { recursive: true });
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths({ adopt = false }: { adopt?: boolean } = {}) {
        return readKeyedEntitiesWithFilePaths(
          "references",
          toAbsoluteReference,
          referenceMapper.fromFile,
          "reference",
          adopt,
        );
      },

      async write(reference: Reference) {
        const { frontmatter, body } = referenceMapper.toFile(reference);
        const entityRelativePath = joinCategoryPath(reference.category, reference.key);
        const absoluteFilePath = toAbsoluteReference(entityRelativePath);

        if (reference.category) {
          await mkdir(join(resolve(vaultPath("references")), reference.category), {
            recursive: true,
          });
        }
        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: entityRelativePath }, "reference written");
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

    sequences: {
      async read(filename) {
        const absolutePath = toAbsoluteSequence(filename);
        const raw = await readYaml(absolutePath);
        try {
          return sequenceMapper.fromFile(raw, config.projectUuid ?? "");
        } catch (cause) {
          throw new VaultError(
            "SEQUENCE_NOT_FOUND",
            `Failed to parse sequence file: "${filename}"`,
            { filePath: filename, reason: "YAML parse or mapping failed" },
            { cause },
          );
        }
      },

      async readAll() {
        const files = await listYamlFiles(sequencesDir);
        return Promise.all(files.map((file) => this.read(file)));
      },

      async readAllWithFilePaths() {
        const files = await listYamlFiles(sequencesDir);
        return Promise.all(
          files.map(async (filename) => {
            const absolutePath = toAbsoluteSequence(filename);
            const rawContent = await readYaml(absolutePath);
            const entity = sequenceMapper.fromFile(rawContent, config.projectUuid ?? "");
            return { entity, filePath: filename, rawContent };
          }),
        );
      },

      async write(sequence: Sequence) {
        await mkdir(sequencesDir, { recursive: true });
        const filename = `${sequence.uuid}.yaml`;
        const absolutePath = toAbsoluteSequence(filename);
        await writeYaml(absolutePath, sequenceMapper.toFile(sequence));
        log.debug({ filename }, "sequence written");
      },

      async delete(filename: string) {
        const absolutePath = toAbsoluteSequence(filename);
        try {
          await unlink(absolutePath);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            throw new VaultError(
              "SEQUENCE_NOT_FOUND",
              `Sequence file not found: ${filename}`,
              { filePath: filename },
              { cause },
            );
          }
          throw cause;
        }
        log.debug({ filename }, "sequence deleted");
      },
    },
  };
};
