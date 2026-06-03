import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Comment anchors for the rich (TipTap) editor (ADR 0009). The `<!--c:ID-->` marker never lives in
// the live document; on load it is parsed into a transient node, converted to one of these anchors,
// and the node removed (see `prose-editor.tsx`). Each anchor is a ProseMirror position mapped forward
// through every transaction, so a comment follows its block deterministically without marker text in
// the prose. Anchors are re-emitted as markers on save. A node decoration cues the annotated block.

export type TiptapAnchor = { markerId: string; pos: number };

export const tiptapAnchorKey = new PluginKey<TiptapAnchor[]>("tiptapAnchors");

// Resolve each anchor position to the top-level block index that currently contains it.
export const tiptapAnchorBlockIndex = (state: EditorState): Map<string, number> => {
  const anchors = tiptapAnchorKey.getState(state) ?? [];
  const map = new Map<string, number>();
  for (const anchor of anchors) {
    let index = 0;
    let found = false;
    state.doc.forEach((node, offset, childIndex) => {
      if (found) return;
      if (anchor.pos >= offset && anchor.pos <= offset + node.nodeSize) {
        index = childIndex;
        found = true;
      }
    });
    if (found) map.set(anchor.markerId, index);
  }
  return map;
};

const decorations = (state: EditorState): DecorationSet => {
  const anchors = tiptapAnchorKey.getState(state) ?? [];
  if (anchors.length === 0) return DecorationSet.empty;
  const decorationList: Decoration[] = [];
  const seenBlocks = new Set<number>();
  for (const anchor of anchors) {
    state.doc.forEach((node, offset) => {
      if (anchor.pos >= offset && anchor.pos <= offset + node.nodeSize) {
        if (seenBlocks.has(offset)) return;
        seenBlocks.add(offset);
        decorationList.push(
          Decoration.node(offset, offset + node.nodeSize, { class: "pm-has-comment" }),
        );
      }
    });
  }
  return DecorationSet.create(state.doc, decorationList);
};

type MarkdownStorage = {
  markdown: { getMarkdown: () => string; serializer: { serialize: (node: unknown) => string } };
};

// Load step (ADR 0009): the content has been parsed so each `<!--c:ID-->` is a transient
// `commentMarker` node. Capture each node's position as an anchor, delete the nodes (leaving a
// marker-free buffer), and store the mapped anchor positions. Dispatched without history so it is not
// an undoable edit; the caller guards onUpdate so it does not dirty the buffer.
export const extractTiptapAnchors = (editor: Editor): void => {
  const found: TiptapAnchor[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "commentMarker") {
      found.push({ markerId: (node.attrs.markerId as string) ?? "", pos });
    }
  });
  let transaction = editor.state.tr;
  for (const anchor of [...found].sort((a, b) => b.pos - a.pos)) {
    transaction = transaction.delete(anchor.pos, anchor.pos + 1);
  }
  const anchors = found.map((anchor) => ({
    markerId: anchor.markerId,
    pos: transaction.mapping.map(anchor.pos, -1),
  }));
  transaction = transaction.setMeta(tiptapAnchorKey, anchors).setMeta("addToHistory", false);
  editor.view.dispatch(transaction);
};

// Save step (ADR 0009): re-emit markers. Insert a transient `commentMarker` node at each anchor's
// position in a detached transaction's doc (highest position first so earlier ones stay valid), then
// serialize that doc to markdown — the live buffer is never touched.
export const serializeTiptapWithMarkers = (editor: Editor): string => {
  const storage = editor.storage as unknown as MarkdownStorage;
  const markerType = editor.schema.nodes.commentMarker;
  const anchors = tiptapAnchorKey.getState(editor.state) ?? [];
  if (!markerType || anchors.length === 0) return storage.markdown.getMarkdown();
  let transaction = editor.state.tr;
  for (const anchor of [...anchors].sort((a, b) => b.pos - a.pos)) {
    try {
      transaction = transaction.insert(
        anchor.pos,
        markerType.create({ markerId: anchor.markerId }),
      );
    } catch {
      // A drifted position that can't host an inline node — drop the marker rather than throw.
    }
  }
  return storage.markdown.serializer.serialize(transaction.doc);
};

export const tiptapAnchorExtension = Extension.create({
  name: "tiptapAnchors",
  addProseMirrorPlugins() {
    return [
      new Plugin<TiptapAnchor[]>({
        key: tiptapAnchorKey,
        state: {
          init: () => [],
          apply(transaction, value) {
            const next = transaction.getMeta(tiptapAnchorKey) as TiptapAnchor[] | undefined;
            if (next) return next;
            if (!transaction.docChanged) return value;
            // Map each position forward; -1 bias keeps a block-end anchor in its block when text is
            // appended at that spot.
            return value.map((anchor) => ({
              markerId: anchor.markerId,
              pos: transaction.mapping.map(anchor.pos, -1),
            }));
          },
        },
        props: {
          decorations(this, state) {
            return decorations(state);
          },
        },
      }),
    ];
  },
});
