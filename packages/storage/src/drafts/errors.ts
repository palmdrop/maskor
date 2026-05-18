export type DraftErrorCode =
  | "DRAFT_NAME_CONFLICT"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_OPERATION_IN_PROGRESS"
  | "INSUFFICIENT_DISK_SPACE"
  | "DRAFT_INVALID_NAME";

export class DraftError extends Error {
  readonly code: DraftErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DraftErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DraftError";
    this.code = code;
    this.details = details;
  }
}
