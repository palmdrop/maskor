import { describe, it, expect } from "bun:test";
import type { Sequence } from "@maskor/shared";
import { fromFile, toFile } from "../vault/markdown/mappers/sequence";

const PROJECT_UUID = "11111111-1111-1111-1111-111111111111";
const SEQUENCE_UUID = "22222222-2222-2222-2222-222222222222";
const SECTION_UUID = "33333333-3333-3333-3333-333333333333";

const baseSequence = (overrides: Partial<Sequence> = {}): Sequence => ({
  uuid: SEQUENCE_UUID,
  name: "Import: chapter.docx",
  isMain: false,
  active: false,
  projectUuid: PROJECT_UUID,
  sections: [{ uuid: SECTION_UUID, name: "Main", fragments: [] }],
  ...overrides,
});

describe("sequence mapper", () => {
  it("round-trips active and origin through the vault file", () => {
    const sequence = baseSequence({
      origin: {
        fileName: "chapter.docx",
        archivePath: ".maskor/imports/22222222-2222-2222-2222-222222222222.docx",
        format: "docx",
        importedAt: "2026-05-31T10:00:00.000Z",
      },
    });

    const loaded = fromFile(toFile(sequence), PROJECT_UUID);

    expect(loaded.active).toBe(false);
    expect(loaded.origin).toEqual(sequence.origin);
  });

  it("defaults active to true for files written before the flag existed", () => {
    // Simulate a legacy file lacking the `active` field entirely.
    const legacyYaml = [
      `uuid: ${SEQUENCE_UUID}`,
      "name: Main",
      "isMain: true",
      "sections:",
      `  - uuid: ${SECTION_UUID}`,
      "    name: Main",
      "    fragments: []",
      "",
    ].join("\n");

    const loaded = fromFile(legacyYaml, PROJECT_UUID);

    expect(loaded.active).toBe(true);
    expect(loaded.origin).toBeUndefined();
  });

  it("omits origin from the file when absent", () => {
    const written = toFile(baseSequence());
    expect(written).not.toContain("origin");
  });
});
