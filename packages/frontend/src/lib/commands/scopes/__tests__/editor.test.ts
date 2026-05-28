import { describe, it, expect, vi } from "vitest";
import { editorCommands, type EditorContext, type InsertCommandTarget } from "../editor";
import type { EntityKind } from "@lib/entity-kinds/registry";

// Narrow by id literal so `.run(ctx)` and `.run(ctx, arg)` accept the right
// arity for the specific command — without narrowing, the union of all
// editor commands' run types collapses to the broadest signature and
// no-arg calls like `find("editor:save").run(ctx)` fail.
type EditorCommand = (typeof editorCommands)[number];
const find = <Id extends EditorCommand["id"]>(id: Id): Extract<EditorCommand, { id: Id }> =>
  editorCommands.find((c) => c.id === id) as Extract<EditorCommand, { id: Id }>;

const makeCtx = (overrides: Partial<EditorContext> = {}): EditorContext => ({
  getSelection: () => ({ text: "snippet", isEmpty: false }),
  eligibleByKind: {
    fragment: [{ uuid: "f-1", key: "frag" }],
    note: [{ uuid: "n-1", key: "note" }],
    reference: [{ uuid: "r-1", key: "ref" }],
    aspect: [{ uuid: "a-1", key: "asp" }],
  },
  extractTo: vi.fn(),
  insertTo: vi.fn(),
  canSave: true,
  save: vi.fn(),
  ...overrides,
});

describe("scopes/editor — save", () => {
  it("runs and reports Nothing to save when canSave=false", () => {
    const ctx = makeCtx();
    find("editor:save").run(ctx);
    expect(ctx.save).toHaveBeenCalled();
    expect(find("editor:save").disabled?.({ ...ctx, canSave: false })).toBe("Nothing to save");
  });

  it("declares the mod+s hotkey", () => {
    expect(find("editor:save").hotkey).toBe("mod+s");
  });
});

describe("scopes/editor — extract", () => {
  it.each([
    ["editor.extract-to-fragment", "fragment"],
    ["editor.extract-to-note", "note"],
    ["editor.extract-to-reference", "reference"],
    ["editor.extract-to-aspect", "aspect"],
  ] as const)("%s passes the selection text and kind", (id, kind) => {
    const ctx = makeCtx();
    find(id).run(ctx);
    expect(ctx.extractTo).toHaveBeenCalledWith(kind, "snippet");
  });

  it("disables when the selection is empty", () => {
    const ctx = makeCtx({ getSelection: () => ({ text: "", isEmpty: true }) });
    expect(find("editor.extract-to-fragment").disabled?.(ctx)).toBe("Select text first");
  });
});

describe("scopes/editor — insert", () => {
  const insertCases = [
    ["editor.append-to-fragment", "append", "fragment"],
    ["editor.append-to-note", "append", "note"],
    ["editor.append-to-reference", "append", "reference"],
    ["editor.append-to-aspect", "append", "aspect"],
    ["editor.prepend-to-fragment", "prepend", "fragment"],
    ["editor.prepend-to-note", "prepend", "note"],
    ["editor.prepend-to-reference", "prepend", "reference"],
    ["editor.prepend-to-aspect", "prepend", "aspect"],
  ] as const;

  it.each(insertCases)("%s passes direction, kind, text, and target", (id, direction, kind) => {
    const ctx = makeCtx();
    const target = ctx.eligibleByKind[kind as EntityKind][0]!;
    find(id).run(ctx, target as InsertCommandTarget);
    expect(ctx.insertTo).toHaveBeenCalledWith(direction, kind, "snippet", target);
  });

  it("arg.items pulls from ctx.eligibleByKind for the matching kind", () => {
    const ctx = makeCtx();
    const command = find("editor.append-to-fragment");
    const items = command.arg!.items(ctx);
    expect(items).toEqual(ctx.eligibleByKind.fragment);
  });

  it("disables when selection is empty", () => {
    const ctx = makeCtx({ getSelection: () => ({ text: "", isEmpty: true }) });
    expect(find("editor.append-to-fragment").disabled?.(ctx)).toBe("Select text first");
  });

  it("disables when no items are eligible for the kind", () => {
    const ctx = makeCtx({
      eligibleByKind: { fragment: [], note: [], reference: [], aspect: [] },
    });
    expect(find("editor.append-to-fragment").disabled?.(ctx)).toBe("No fragments to append to");
    expect(find("editor.prepend-to-note").disabled?.(ctx)).toBe("No notes to prepend to");
  });
});
