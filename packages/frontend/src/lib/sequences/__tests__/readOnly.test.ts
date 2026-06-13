import { describe, it, expect } from "vitest";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { isSequenceReadOnly } from "../readOnly";

const makeSequence = (origin?: Sequence["origin"]): Sequence => ({
  uuid: "s-1",
  name: "Sequence",
  isMain: false,
  active: true,
  projectUuid: "project-1",
  filePath: "s-1.yaml",
  contentHash: "hash",
  sections: [],
  ...(origin ? { origin } : {}),
});

describe("isSequenceReadOnly", () => {
  it("treats a sequence carrying an origin as read-only", () => {
    expect(
      isSequenceReadOnly(
        makeSequence({
          fileName: "draft.md",
          archivePath: ".maskor/imports/draft.md",
          format: "markdown",
          importedAt: "2026-06-13T00:00:00.000Z",
        }),
      ),
    ).toBe(true);
  });

  it("treats a sequence without an origin as writable", () => {
    expect(isSequenceReadOnly(makeSequence())).toBe(false);
  });
});
