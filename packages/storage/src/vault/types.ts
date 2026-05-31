import type { Aspect, Fragment, Note, Reference, Sequence } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";

export type VaultConfig = {
  root: string;
  projectUuid?: string;
  logger?: Logger;
};

export type VaultErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_ALREADY_EXISTS"
  | "FILE_DELETE_FAILED"
  | "FILE_MOVE_FAILED"
  | "PATH_OUT_OF_BOUNDS"
  | "FRAGMENT_NOT_FOUND"
  | "ENTITY_NOT_FOUND"
  | "STALE_INDEX"
  | "FRAGMENT_NOT_DISCARDED"
  | "KEY_CONFLICT"
  | "SEQUENCE_NOT_FOUND";

export type VaultErrorContext = {
  filePath?: string;
  uuid?: string;
  reason?: string;
};

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly context: VaultErrorContext;

  constructor(
    code: VaultErrorCode,
    message: string,
    context: VaultErrorContext = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VaultError";
    this.code = code;
    this.context = context;
  }
}

export type WithFilePath<T> = { entity: T; filePath: string; rawContent: string };

// Passed to readAllWithFilePaths. `adopt` opts into write-back canonicalization (mint missing
// UUIDs to disk) and is only set by the indexer rebuild; plain reads leave it false and stay pure.
export type ReadAllOptions = { adopt?: boolean };

export type Vault = {
  root: string;
  fragments: {
    readAll(): Promise<Fragment[]>;
    readAllWithFilePaths(options?: ReadAllOptions): Promise<Array<WithFilePath<Fragment>>>;
    read(filePath: string): Promise<Fragment>;
    write(fragment: Fragment): Promise<void>;
    discard(filePath: string): Promise<void>;
    restore(filePath: string): Promise<void>;
    delete(filePath: string): Promise<void>;
  };
  aspects: {
    readAll(): Promise<Aspect[]>;
    readAllWithFilePaths(options?: ReadAllOptions): Promise<Array<WithFilePath<Aspect>>>;
    read(filePath: string): Promise<Aspect>;
    write(aspect: Aspect): Promise<void>;
    delete(filePath: string): Promise<void>;
  };
  notes: {
    readAll(): Promise<Note[]>;
    readAllWithFilePaths(options?: ReadAllOptions): Promise<Array<WithFilePath<Note>>>;
    read(filePath: string): Promise<Note>;
    write(note: Note): Promise<void>;
    delete(filePath: string): Promise<void>;
  };
  references: {
    readAll(): Promise<Reference[]>;
    readAllWithFilePaths(options?: ReadAllOptions): Promise<Array<WithFilePath<Reference>>>;
    read(filePath: string): Promise<Reference>;
    write(reference: Reference): Promise<void>;
    delete(filePath: string): Promise<void>;
  };
  sequences: {
    readAll(): Promise<Sequence[]>;
    readAllWithFilePaths(): Promise<Array<WithFilePath<Sequence>>>;
    read(filename: string): Promise<Sequence>;
    write(sequence: Sequence): Promise<void>;
    delete(filename: string): Promise<void>;
  };
};
