import { Node, mergeAttributes } from "@tiptap/core";
import type MarkdownIt from "markdown-it";
import { buildCommentMarker, MARKER_ID_CHAR_CLASS } from "@maskor/shared";

// A schema-modeled, invisible inline node carrying a Margin comment's anchor marker id. The marker
// trails a fragment block as `<!--c:ID-->`. A naive HTML comment would not survive TipTap's
// markdown→ProseMirror→markdown round-trip (html:false renders it as escaped text), so we model it
// explicitly: a markdown-it inline rule tokenizes the marker into this node, and the markdown
// serializer re-emits it verbatim. Invisible in the rendered prose; the Margin panel surfaces it.

const TOKEN_NAME = "commentMarker";
// Matches a marker at the current markdown-it parse position. Built from the shared char-class so it
// can't drift from the rest of the marker machinery.
const INLINE_MARKER = new RegExp(`^<!--c:([${MARKER_ID_CHAR_CLASS}]+)-->`);

export const CommentMarker = Node.create({
  name: TOKEN_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      markerId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-marker"),
        renderHTML: (attributes) =>
          attributes.markerId ? { "data-comment-marker": attributes.markerId as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-marker]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const markerId = node.attrs.markerId as string | null;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        ...(markerId ? { "data-comment-marker": markerId } : {}),
        "aria-hidden": "true",
        class: "comment-marker",
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        // Re-emit the marker verbatim so a markdown→ProseMirror→markdown round-trip is byte-stable.
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { markerId: string | null } },
        ) {
          if (node.attrs.markerId) state.write(buildCommentMarker(node.attrs.markerId));
        },
        parse: {
          setup(markdownit: MarkdownIt) {
            markdownit.inline.ruler.before("text", TOKEN_NAME, (state, silent) => {
              const match = INLINE_MARKER.exec(state.src.slice(state.pos));
              if (!match) return false;
              if (!silent) {
                const token = state.push(TOKEN_NAME, "", 0);
                token.meta = { markerId: match[1] };
              }
              state.pos += match[0].length;
              return true;
            });

            markdownit.renderer.rules[TOKEN_NAME] = (tokens, index) => {
              const markerId = (tokens[index]?.meta as { markerId?: string })?.markerId ?? "";
              return `<span data-comment-marker="${markdownit.utils.escapeHtml(markerId)}"></span>`;
            };
          },
        },
      },
    };
  },
});
