import { describe, it, expect } from "vitest";
import type { LogEntry } from "@maskor/shared";
import { renderFragmentEntryText } from "./fragment";
import { renderAspectEntryText } from "./aspect";
import { renderNoteEntryText } from "./note";
import { renderReferenceEntryText } from "./reference";

const base = {
  id: "test-id",
  timestamp: "2026-01-01T00:00:00Z",
  actor: "user" as const,
  target: { type: "fragment" as const, uuid: "uuid-1", key: "late-winter" },
  undoable: true,
};

describe("renderFragmentEntryText", () => {
  it("renders fragment:edited", () => {
    const entry: LogEntry = { ...base, type: "fragment:edited", payload: {} };
    expect(renderFragmentEntryText(entry)).toBe('Fragment "late-winter" edited');
  });

  it("renders fragment:ready-status-changed", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:ready-status-changed",
      payload: { from: 0.2, to: 0.5 },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Ready status on fragment "late-winter": 20% → 50%',
    );
  });

  it("renders fragment:note-attached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:note-attached",
      payload: { noteKey: "bridge-obs" },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Note "bridge-obs" attached to fragment "late-winter"',
    );
  });

  it("renders fragment:note-detached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:note-detached",
      payload: { noteKey: "bridge-obs" },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Note "bridge-obs" detached from fragment "late-winter"',
    );
  });

  it("renders fragment:reference-attached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:reference-attached",
      payload: { referenceKey: "ref-a" },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Reference "ref-a" attached to fragment "late-winter"',
    );
  });

  it("renders fragment:reference-detached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:reference-detached",
      payload: { referenceKey: "ref-a" },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Reference "ref-a" detached from fragment "late-winter"',
    );
  });

  it("renders fragment:aspect-attached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:aspect-attached",
      payload: { aspectKey: "tone", weight: 0.5 },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Aspect "tone" attached to fragment "late-winter" at 50%',
    );
  });

  it("renders fragment:aspect-detached", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:aspect-detached",
      payload: { aspectKey: "tone" },
    };
    expect(renderFragmentEntryText(entry)).toBe('Aspect "tone" detached from fragment "late-winter"');
  });

  it("renders fragment:aspect-weight-changed", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:aspect-weight-changed",
      payload: { aspectKey: "tone", from: 0.5, to: 0.7 },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'tone weight on fragment "late-winter": 50% → 70%',
    );
  });

  it("renders fragment:renamed", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:renamed",
      payload: { oldKey: "old-name", newKey: "new-name" },
    };
    expect(renderFragmentEntryText(entry)).toBe('Fragment renamed: "old-name" → "new-name"');
  });

  it("renders fragment:updated with changedFields", () => {
    const entry: LogEntry = {
      ...base,
      type: "fragment:updated",
      payload: { changedFields: ["content", "readyStatus"] },
    };
    expect(renderFragmentEntryText(entry)).toBe(
      'Fragment "late-winter" edited — content, readyStatus',
    );
  });
});

describe("renderAspectEntryText", () => {
  const aspectBase = {
    ...base,
    target: { type: "aspect" as const, uuid: "uuid-2", key: "tone" },
  };

  it("renders aspect:description-edited", () => {
    const entry: LogEntry = { ...aspectBase, type: "aspect:description-edited", payload: {} };
    expect(renderAspectEntryText(entry)).toBe('Aspect "tone" description edited');
  });

  it("renders aspect:category-changed", () => {
    const entry: LogEntry = {
      ...aspectBase,
      type: "aspect:category-changed",
      payload: { from: "old-cat", to: "new-cat" },
    };
    expect(renderAspectEntryText(entry)).toBe('Aspect "tone" category: "old-cat" → "new-cat"');
  });

  it("renders aspect:category-changed with undefined from", () => {
    const entry: LogEntry = {
      ...aspectBase,
      type: "aspect:category-changed",
      payload: { from: undefined, to: "new-cat" },
    };
    expect(renderAspectEntryText(entry)).toBe('Aspect "tone" category: "none" → "new-cat"');
  });

  it("renders aspect:note-attached", () => {
    const entry: LogEntry = {
      ...aspectBase,
      type: "aspect:note-attached",
      payload: { noteKey: "bridge-obs" },
    };
    expect(renderAspectEntryText(entry)).toBe('Note "bridge-obs" attached to aspect "tone"');
  });

  it("renders aspect:note-detached", () => {
    const entry: LogEntry = {
      ...aspectBase,
      type: "aspect:note-detached",
      payload: { noteKey: "bridge-obs" },
    };
    expect(renderAspectEntryText(entry)).toBe('Note "bridge-obs" detached from aspect "tone"');
  });
});

describe("renderNoteEntryText", () => {
  const noteBase = {
    ...base,
    target: { type: "note" as const, uuid: "uuid-3", key: "bridge-obs" },
  };

  it("renders note:edited", () => {
    const entry: LogEntry = { ...noteBase, type: "note:edited", payload: {} };
    expect(renderNoteEntryText(entry)).toBe('Note "bridge-obs" edited');
  });

  it("renders note:updated", () => {
    const entry: LogEntry = {
      ...noteBase,
      type: "note:updated",
      payload: { changedFields: ["content"] },
    };
    expect(renderNoteEntryText(entry)).toBe('Note "bridge-obs" edited');
  });
});

describe("renderReferenceEntryText", () => {
  const refBase = {
    ...base,
    target: { type: "reference" as const, uuid: "uuid-4", key: "ref-a" },
  };

  it("renders reference:edited", () => {
    const entry: LogEntry = { ...refBase, type: "reference:edited", payload: {} };
    expect(renderReferenceEntryText(entry)).toBe('Reference "ref-a" edited');
  });

  it("renders reference:updated", () => {
    const entry: LogEntry = {
      ...refBase,
      type: "reference:updated",
      payload: { changedFields: ["content"] },
    };
    expect(renderReferenceEntryText(entry)).toBe('Reference "ref-a" edited');
  });
});
