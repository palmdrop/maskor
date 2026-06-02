import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// Document-side flow alignment for the rich (TipTap) editor (ADR 0009): a widget decoration injects
// vertical space *below* a top-level block so a Margin comment taller than its block pushes the next
// paragraph down, keeping the rows aligned. The spacer is presentation only — it lives in a
// decoration, never in the document/markdown, and a meta-only transaction (no doc change) so it never
// dirties the buffer. Spacers are indexed by top-level block, set via `setBlockSpacers`.

export const blockSpacerKey = new PluginKey<number[]>("blockSpacer");

const buildDecorations = (doc: ProseMirrorNode, spacers: readonly number[]): DecorationSet => {
  const decorations: Decoration[] = [];
  let index = 0;
  doc.forEach((node, offset) => {
    const spacer = spacers[index] ?? 0;
    index += 1;
    if (spacer <= 0) return;
    // Position just after the block node — the widget renders as a block-level gap between this block
    // and the next, and is excluded from the block's own `nodeDOM` height measurement.
    const position = offset + node.nodeSize;
    decorations.push(
      Decoration.widget(
        position,
        () => {
          const element = document.createElement("div");
          element.style.height = `${spacer}px`;
          element.setAttribute("aria-hidden", "true");
          element.dataset.blockSpacer = "true";
          return element;
        },
        { side: -1 },
      ),
    );
  });
  return DecorationSet.create(doc, decorations);
};

export const blockSpacerExtension = Extension.create({
  name: "blockSpacer",
  addProseMirrorPlugins() {
    return [
      new Plugin<number[]>({
        key: blockSpacerKey,
        state: {
          init: () => [],
          apply(transaction, value) {
            const next = transaction.getMeta(blockSpacerKey) as number[] | undefined;
            return next ?? value;
          },
        },
        props: {
          decorations(state) {
            return buildDecorations(state.doc, blockSpacerKey.getState(state) ?? []);
          },
        },
      }),
    ];
  },
});
