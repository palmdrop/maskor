import type { Aspect, Fragment, Logger, Note, Reference } from "@maskor/shared";

export type VaultConfig = {
  root: string;
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
  | "PIECE_CONSUME_FAILED"
  | "STALE_INDEX";

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

export type WithFilePath<T> = { entity: T; filePath: string };

export type Vault = {
  fragments: {
    readAll(): Promise<Fragment[]>;
    readAllWithFilePaths(): Promise<Array<WithFilePath<Fragment>>>;
    read(filePath: string): Promise<Fragment>;
    write(fragment: Fragment): Promise<void>;
    discard(filePath: string): Promise<void>;
  };
  aspects: {
    readAll(): Promise<Aspect[]>;
    readAllWithFilePaths(): Promise<Array<WithFilePath<Aspect>>>;
    read(filePath: string): Promise<Aspect>;
    write(aspect: Aspect): Promise<void>;
  };
  notes: {
    readAll(): Promise<Note[]>;
    readAllWithFilePaths(): Promise<Array<WithFilePath<Note>>>;
    read(filePath: string): Promise<Note>;
    write(note: Note): Promise<void>;
  };
  references: {
    readAll(): Promise<Reference[]>;
    readAllWithFilePaths(): Promise<Array<WithFilePath<Reference>>>;
    read(filePath: string): Promise<Reference>;
    write(reference: Reference): Promise<void>;
  };
  pieces: {
    consumeAll(): Promise<Fragment[]>;
  };
};
