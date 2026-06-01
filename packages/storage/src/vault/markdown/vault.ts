import type { Aspect, Margin, Note, Reference, Sequence } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { EntityReadFailure, ReadAllResult, Vault, VaultConfig, WithFilePath } from "../types";
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
import * as marginMapper from "./mappers/margin";
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

// Fault-tolerant bulk read: read every file via `readOne`, collecting successes and per-file
// failures instead of rejecting the whole batch on the first malformed file. Rebuild relies on
// this so one unparseable entity does not wedge the entire index. A failed file is never
// rewritten — `readOne` only writes back after a successful parse.
const readEntitiesSettled = async <TEntity>(
  files: string[],
  readOne: (filePath: string) => Promise<WithFilePath<TEntity>>,
): Promise<ReadAllResult<TEntity>> => {
  const outcomes = await Promise.all(
    files.map(
      async (
        filePath,
      ): Promise<
        { ok: true; entry: WithFilePath<TEntity> } | { ok: false; failure: EntityReadFailure }
      > => {
        try {
          return { ok: true, entry: await readOne(filePath) };
        } catch (error) {
          return {
            ok: false,
            failure: { filePath, error: error instanceof Error ? error.message : String(error) },
          };
        }
      },
    ),
  );

  const entities: Array<WithFilePath<TEntity>> = [];
  const failures: EntityReadFailure[] = [];

  for (const outcome of outcomes) {
    if (outcome.ok) {
      entities.push(outcome.entry);
    } else {
      failures.push(outcome.failure);
    }
  }

  return { entities, failures };
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
  const toAbsoluteMargin = makeToAbsolute(resolve(vaultPath("margins")));
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
  ): Promise<ReadAllResult<TEntity>> => {
    const files = await listMarkdownFiles(vaultPath(subdir), { recursive: true });
    return readEntitiesSettled(files, async (filePath) => {
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
    });
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
        return readEntitiesSettled([...active, ...discarded], async (filePath) => {
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
        });
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
        return readEntitiesSettled(files, async (filename) => {
          const absolutePath = toAbsoluteSequence(filename);
          const rawContent = await readYaml(absolutePath);
          const entity = sequenceMapper.fromFile(rawContent, config.projectUuid ?? "");
          return { entity, filePath: filename, rawContent };
        });
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

    margins: {
      // filePath is relative to the margins/ directory.
      // Active margins: "the-bridge.md"; discarded margins: "discarded/the-bridge.md".
      async read(filePath) {
        const absolutePath = toAbsoluteMargin(filePath);
        const raw = await readMarkdown(absolutePath);
        return marginMapper.fromFile(parseFile(raw), filePath);
      },

      async readAll() {
        const active = await listMarkdownFiles(vaultPath("margins"));
        const discardedFiles = await listMarkdownFiles(vaultPath("margins", "discarded"));
        const discarded = discardedFiles.map((fileName) => join("discarded", fileName));
        return Promise.all([...active, ...discarded].map((filePath) => this.read(filePath)));
      },

      async readAllWithFilePaths() {
        const active = await listMarkdownFiles(vaultPath("margins"));
        const discardedFiles = await listMarkdownFiles(vaultPath("margins", "discarded"));
        const discarded = discardedFiles.map((fileName) => join("discarded", fileName));
        return readEntitiesSettled([...active, ...discarded], async (filePath) => {
          const absolutePath = toAbsoluteMargin(filePath);
          const rawContent = await readMarkdown(absolutePath);
          return {
            entity: marginMapper.fromFile(parseFile(rawContent), filePath),
            filePath,
            rawContent,
          };
        });
      },

      // Writes to the active path margins/<fragment-key>.md. A Margin is lazily created: callers
      // only write once the user authors the first note or comment. Discarded margins are moved by
      // `discard`, not written here.
      async write(margin: Margin) {
        const { frontmatter, body } = marginMapper.toFile(margin);
        const absoluteFilePath = toAbsoluteMargin(`${margin.fragmentKey}.md`);
        await mkdir(resolve(vaultPath("margins")), { recursive: true });
        await writeMarkdown(absoluteFilePath, serializeFile({ frontmatter, body }));
        log.debug({ filePath: `${margin.fragmentKey}.md` }, "margin written");
      },

      // Cascade helper: rename the Margin file to follow a fragment rename, preserving whichever
      // directory (active or discarded/) the Margin currently sits in. No-op when the fragment has
      // no Margin yet.
      async rename(oldKey: string, newKey: string) {
        if (oldKey === newKey) return;
        const activeSource = toAbsoluteMargin(`${oldKey}.md`);
        const discardedSource = toAbsoluteMargin(join("discarded", `${oldKey}.md`));
        const [source, destination] = (await Bun.file(activeSource).exists())
          ? [activeSource, toAbsoluteMargin(`${newKey}.md`)]
          : (await Bun.file(discardedSource).exists())
            ? [discardedSource, toAbsoluteMargin(join("discarded", `${newKey}.md`))]
            : [null, null];
        if (!source || !destination) return;
        try {
          await rename(source, destination);
        } catch (cause) {
          throw new VaultError(
            "FILE_MOVE_FAILED",
            `Failed to rename margin "${oldKey}" -> "${newKey}"`,
            { filePath: `${oldKey}.md`, reason: "fs.rename failed" },
            { cause },
          );
        }
        log.debug({ oldKey, newKey }, "margin renamed");
      },

      // Cascade helper: move the active Margin into margins/discarded/. No-op when absent.
      async discard(key: string) {
        const absoluteSource = toAbsoluteMargin(`${key}.md`);
        if (!(await Bun.file(absoluteSource).exists())) return;
        const absoluteDestination = toAbsoluteMargin(join("discarded", `${key}.md`));
        await mkdir(join(resolve(vaultPath("margins")), "discarded"), { recursive: true });
        try {
          await rename(absoluteSource, absoluteDestination);
        } catch (cause) {
          throw new VaultError(
            "FILE_MOVE_FAILED",
            `Failed to move margin to discarded/`,
            { filePath: `${key}.md`, reason: "fs.rename failed" },
            { cause },
          );
        }
        log.debug({ key }, "margin discarded");
      },

      // Cascade helper: move the Margin back out of margins/discarded/. No-op when absent.
      async restore(key: string) {
        const absoluteSource = toAbsoluteMargin(join("discarded", `${key}.md`));
        if (!(await Bun.file(absoluteSource).exists())) return;
        const absoluteDestination = toAbsoluteMargin(`${key}.md`);
        try {
          await rename(absoluteSource, absoluteDestination);
        } catch (cause) {
          throw new VaultError(
            "FILE_MOVE_FAILED",
            `Failed to move margin out of discarded/`,
            { filePath: join("discarded", `${key}.md`), reason: "fs.rename failed" },
            { cause },
          );
        }
        log.debug({ key }, "margin restored");
      },

      // Cascade helper: delete the Margin alongside its fragment. The fragment must be discarded
      // before deletion, so the Margin is looked for in margins/discarded/ first, then active as a
      // fallback. No-op when absent.
      async delete(key: string) {
        const discardedPath = toAbsoluteMargin(join("discarded", `${key}.md`));
        const activePath = toAbsoluteMargin(`${key}.md`);
        const target = (await Bun.file(discardedPath).exists())
          ? discardedPath
          : (await Bun.file(activePath).exists())
            ? activePath
            : null;
        if (!target) return;
        try {
          await unlink(target);
        } catch (cause) {
          if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") return;
          throw cause;
        }
        log.debug({ key }, "margin deleted");
      },
    },
  };
};
