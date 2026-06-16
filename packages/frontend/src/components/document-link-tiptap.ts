import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import { parseDocumentLinks, type LinkPathType } from "@maskor/shared";
import { resolveParsedLink, type LinkLookups } from "@lib/document-links/resolver";

// Document-link rendering for the rich (TipTap) editor. The link text `[[type/key]]` is ordinary
// prose text — it round-trips through markdown untouched (no special node), so this extension only
// *decorates* link ranges (resolved vs broken) and handles Cmd/Ctrl-click navigation. Decorations are
// computed per text node, mapping in-node match offsets to absolute ProseMirror positions.

export type TiptapLinkConfig = {
  lookups: LinkLookups;
  navigate: (pathType: LinkPathType, uuid: string) => void;
};

export const documentLinkPluginKey = new PluginKey<TiptapLinkConfig | null>("documentLink");

const buildDecorations = (state: EditorState, config: TiptapLinkConfig | null): DecorationSet => {
  if (!config) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const parsed of parseDocumentLinks(node.text)) {
      const resolved = resolveParsedLink(parsed, config.lookups);
      const from = pos + parsed.index;
      const to = from + parsed.raw.length;
      decorations.push(
        Decoration.inline(from, to, {
          class: resolved.uuid ? "doc-link" : "doc-link-broken",
        }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
};

const linkAt = (
  state: EditorState,
  config: TiptapLinkConfig | null,
  pos: number,
): { pathType: LinkPathType; uuid: string } | null => {
  if (!config) return null;
  let hit: { pathType: LinkPathType; uuid: string } | null = null;
  state.doc.descendants((node, nodePos) => {
    if (hit || !node.isText || !node.text) return;
    for (const parsed of parseDocumentLinks(node.text)) {
      const from = nodePos + parsed.index;
      const to = from + parsed.raw.length;
      if (pos >= from && pos <= to) {
        const resolved = resolveParsedLink(parsed, config.lookups);
        if (resolved.uuid && resolved.pathType) {
          hit = { pathType: resolved.pathType, uuid: resolved.uuid };
        }
        return;
      }
    }
  });
  return hit;
};

export const DocumentLink = Extension.create({
  name: "documentLink",

  addProseMirrorPlugins() {
    return [
      new Plugin<TiptapLinkConfig | null>({
        key: documentLinkPluginKey,
        state: {
          init: () => null,
          apply(transaction, value) {
            const next = transaction.getMeta(documentLinkPluginKey) as TiptapLinkConfig | undefined;
            return next ?? value;
          },
        },
        props: {
          decorations(state) {
            return buildDecorations(state, this.getState(state) ?? null);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              if (!(event.metaKey || event.ctrlKey)) return false;
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!coords) return false;
              const config = documentLinkPluginKey.getState(view.state) ?? null;
              const hit = linkAt(view.state, config, coords.pos);
              if (!hit || !config) return false;
              event.preventDefault();
              config.navigate(hit.pathType, hit.uuid);
              return true;
            },
          },
        },
      }),
    ];
  },
});
