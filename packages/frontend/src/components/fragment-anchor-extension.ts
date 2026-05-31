import { Node, mergeAttributes } from "@tiptap/core";
import type MarkdownIt from "markdown-it";
import { anchorSentinel, ANCHOR_SENTINEL_LINE_PATTERN } from "@maskor/shared/sentinel";

// A schema-modeled, invisible anchor node. The exporter embeds collision-safe
// sentinel tokens in the assembled markdown (preview/import only); a markdown-it
// block rule turns each sentinel line into a `<div data-fragment-anchor>`, which
// this node parses and re-renders as `id="fragment-<id>"`. The id is what the
// sidebar scrolls to via `getElementById`.
//
// `html` stays false on the renderer: the sentinel HTML is produced by OUR
// markdown-it rule, not by emitting raw user HTML, so no injection surface
// reopens. The node carries no content and renders an empty, zero-footprint div,
// so it is invisible in the prose. See
// `references/adr/0003-preview-anchor-sentinels.md`.

const TOKEN_NAME = "fragmentAnchor";

export const FragmentAnchor = Node.create({
  name: TOKEN_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      anchorId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-fragment-anchor"),
        renderHTML: (attributes) =>
          attributes.anchorId ? { "data-fragment-anchor": attributes.anchorId as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-fragment-anchor]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const anchorId = node.attrs.anchorId as string | null;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        ...(anchorId ? { id: `fragment-${anchorId}` } : {}),
        "aria-hidden": "true",
        class: "fragment-anchor",
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        // Read-only renderers never serialize, but keep the serializer total in
        // case getMarkdown is ever called: re-emit the sentinel verbatim.
        serialize(
          state: { write: (text: string) => void; closeBlock: (node: unknown) => void },
          node: { attrs: { anchorId: string | null } },
        ) {
          if (node.attrs.anchorId) {
            state.write(anchorSentinel(node.attrs.anchorId));
            state.closeBlock(node);
          }
        },
        parse: {
          // Parameter types are inferred from the markdown-it method signatures,
          // so no subpath type imports are needed.
          setup(markdownit: MarkdownIt) {
            markdownit.block.ruler.before(
              "paragraph",
              TOKEN_NAME,
              (state, startLine, _endLine, silent) => {
                const start = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(start, max);

                const match = ANCHOR_SENTINEL_LINE_PATTERN.exec(line);
                if (!match) return false;
                if (silent) return true;

                const token = state.push(TOKEN_NAME, "", 0);
                token.meta = { anchorId: match[1] };
                token.map = [startLine, startLine + 1];
                token.block = true;

                state.line = startLine + 1;
                return true;
              },
            );

            markdownit.renderer.rules[TOKEN_NAME] = (tokens, index) => {
              const anchorId = (tokens[index]?.meta as { anchorId?: string })?.anchorId ?? "";
              return `<div data-fragment-anchor="${markdownit.utils.escapeHtml(anchorId)}"></div>\n`;
            };
          },
        },
      },
    };
  },
});
