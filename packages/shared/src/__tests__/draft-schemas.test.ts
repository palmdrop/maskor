import { describe, it, expect } from "bun:test";
import {
  DraftManifestSchema,
  LogEntrySchema,
  LogEntryTargetSchema,
  ActionTypeSchema,
} from "../schemas/domain";

describe("DraftManifestSchema", () => {
  it("accepts a full manifest with note", () => {
    const parsed = DraftManifestSchema.parse({
      uuid: "11111111-1111-1111-1111-111111111111",
      name: "Draft 1",
      note: "Before the rewrite",
      createdAt: "2026-05-18T12:00:00.000Z",
      entityCounts: { fragments: 3, aspects: 1, notes: 0, references: 0, sequences: 1 },
    });
    expect(parsed.name).toBe("Draft 1");
    expect(parsed.note).toBe("Before the rewrite");
  });

  it("accepts a manifest without note", () => {
    const parsed = DraftManifestSchema.parse({
      uuid: "11111111-1111-1111-1111-111111111111",
      name: "Draft 2",
      createdAt: "2026-05-18T12:00:00.000Z",
      entityCounts: { fragments: 0, aspects: 0, notes: 0, references: 0, sequences: 0 },
    });
    expect(parsed.note).toBeUndefined();
  });

  it("rejects empty name", () => {
    expect(() =>
      DraftManifestSchema.parse({
        uuid: "u",
        name: "",
        createdAt: "now",
        entityCounts: { fragments: 0, aspects: 0, notes: 0, references: 0, sequences: 0 },
      }),
    ).toThrow();
  });
});

describe("draft action-log entries", () => {
  it("draft target type is accepted", () => {
    const parsed = LogEntryTargetSchema.parse({
      type: "draft",
      uuid: "11111111-1111-1111-1111-111111111111",
      title: "Draft 1",
    });
    expect(parsed.type).toBe("draft");
  });

  it("draft:created round-trips", () => {
    const entry = LogEntrySchema.parse({
      id: "e1",
      timestamp: "2026-05-18T12:00:00.000Z",
      correlationId: "corr-e1",
      type: "draft:created",
      actor: "user",
      target: { type: "draft", uuid: "u1", title: "Draft 1" },
      payload: { name: "Draft 1", note: "after first chapter" },
      undoable: false,
    });
    expect(entry.type).toBe("draft:created");
    if (entry.type === "draft:created") {
      expect(entry.payload.name).toBe("Draft 1");
      expect(entry.payload.note).toBe("after first chapter");
    }
  });

  it("draft:deleted round-trips", () => {
    const entry = LogEntrySchema.parse({
      id: "e2",
      timestamp: "2026-05-18T12:00:00.000Z",
      correlationId: "corr-e2",
      type: "draft:deleted",
      actor: "user",
      target: { type: "draft", uuid: "u1", title: "Draft 1" },
      payload: { name: "Draft 1" },
      undoable: false,
    });
    expect(entry.type).toBe("draft:deleted");
  });

  it("draft:restored round-trips with pre-restore uuid", () => {
    const entry = LogEntrySchema.parse({
      id: "e3",
      timestamp: "2026-05-18T12:00:00.000Z",
      correlationId: "corr-e3",
      type: "draft:restored",
      actor: "user",
      target: { type: "draft", uuid: "u1", title: "Draft 1" },
      payload: { name: "Draft 1", preRestoreDraftUuid: "u-pre" },
      undoable: false,
    });
    expect(entry.type).toBe("draft:restored");
    if (entry.type === "draft:restored") {
      expect(entry.payload.preRestoreDraftUuid).toBe("u-pre");
    }
  });

  it("includes new types in ActionTypeSchema", () => {
    expect(ActionTypeSchema.options).toContain("draft:created");
    expect(ActionTypeSchema.options).toContain("draft:deleted");
    expect(ActionTypeSchema.options).toContain("draft:restored");
  });
});
