import { describe, it, expect, mock, beforeEach } from "bun:test";
import { mkdtempSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const trashMock = mock(async (_input: string | string[]) => {});

mock.module("trash", () => ({
  default: trashMock,
}));

const { moveToTrashOrDelete } = await import("../../helpers/trash");

describe("moveToTrashOrDelete", () => {
  beforeEach(() => {
    trashMock.mockReset();
  });

  it("returns { method: 'trash' } when trash succeeds", async () => {
    trashMock.mockImplementation(async () => {});

    const result = await moveToTrashOrDelete("/some/fake/path");

    expect(result).toEqual({ method: "trash" });
    expect(trashMock).toHaveBeenCalledWith("/some/fake/path");
  });

  it("returns { method: 'hard-delete' } and deletes the path when trash throws", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-trash-test-"));
    mkdirSync(join(temporaryDirectory, "nested"), { recursive: true });

    trashMock.mockImplementation(async () => {
      throw new Error("trash not available");
    });

    const result = await moveToTrashOrDelete(temporaryDirectory);

    expect(result).toEqual({ method: "hard-delete" });
    expect(existsSync(temporaryDirectory)).toBe(false);
  });
});
