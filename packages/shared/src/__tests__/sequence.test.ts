import { describe, it, expect } from "bun:test";
import { isSequenceReadOnly, type Sequence, type SequenceOrigin } from "../schemas/domain/sequence";

const ORIGIN: SequenceOrigin = {
  fileName: "draft.md",
  archivePath: ".maskor/imports/draft.md",
  format: "markdown",
  importedAt: "2026-06-13T00:00:00.000Z",
};

const makeSequence = (origin?: SequenceOrigin): Sequence => ({
  uuid: "00000000-0000-0000-0000-000000000001",
  name: "Sequence",
  isMain: false,
  active: true,
  projectUuid: "00000000-0000-0000-0000-000000000002",
  sections: [],
  ...(origin ? { origin } : {}),
});

describe("isSequenceReadOnly", () => {
  it("treats a sequence carrying an origin (an import-sequence) as read-only", () => {
    expect(isSequenceReadOnly(makeSequence(ORIGIN))).toBe(true);
  });

  it("treats a sequence without an origin as writable", () => {
    expect(isSequenceReadOnly(makeSequence())).toBe(false);
  });

  it("accepts any object with an optional origin (structural type)", () => {
    expect(isSequenceReadOnly({})).toBe(false);
    expect(isSequenceReadOnly({ origin: ORIGIN })).toBe(true);
  });
});
