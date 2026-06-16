import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { buildDocumentLink, type LinkPathType } from "@maskor/shared";

// Rich-mode `[[` autocomplete (the CM6 editor has the equivalent via @codemirror/autocomplete). Typing
// `[[` opens a popup listing every linkable entity project-wide; selecting one replaces the typed
// `[[query` with the canonical `[[type/key]]`. The list is fed by a getter so it tracks the current
// project entities without rebuilding the extension. Insertion matches the command-palette "Insert
// link" action (literal prose, round-trips through markdown).

export type LinkSuggestionItem = { pathType: LinkPathType; key: string };

export const documentLinkSuggestionPluginKey = new PluginKey("documentLinkSuggestion");

const MAX_RESULTS = 30;

// Exported for unit testing. Case-insensitive substring match on the key and on `type/key`, capped.
export const filterItems = (items: LinkSuggestionItem[], query: string): LinkSuggestionItem[] => {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? items.filter(
        (item) =>
          item.key.toLowerCase().includes(normalized) ||
          `${item.pathType}/${item.key}`.toLowerCase().includes(normalized),
      )
    : items;
  return matches.slice(0, MAX_RESULTS);
};

// A tiny imperative popup positioned at the caret. Avoids pulling in a positioning library (tippy /
// floating-ui) for a single list — the suggestion plugin hands us a `clientRect`, which is enough.
type PopupCommand = (item: LinkSuggestionItem) => void;

const createPopup = () => {
  const element = document.createElement("div");
  element.className = "doc-link-suggestion-popup";
  let items: LinkSuggestionItem[] = [];
  let selectedIndex = 0;
  let onCommand: PopupCommand = () => {};

  const render = () => {
    element.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "doc-link-suggestion-empty";
      empty.textContent = "No matching entities";
      element.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "doc-link-suggestion-option";
      option.setAttribute("data-selected", index === selectedIndex ? "true" : "false");

      const key = document.createElement("span");
      key.className = "doc-link-suggestion-key";
      key.textContent = item.key;
      const type = document.createElement("span");
      type.className = "doc-link-suggestion-type";
      type.textContent = item.pathType;
      option.append(key, type);

      // mousedown (not click) so the editor selection isn't lost to a focus change before we insert.
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        onCommand(item);
      });
      element.appendChild(option);
    });
  };

  const position = (rect: DOMRect | null) => {
    if (!rect) return;
    element.style.position = "absolute";
    element.style.left = `${rect.left + window.scrollX}px`;
    element.style.top = `${rect.bottom + window.scrollY + 4}px`;
  };

  return {
    element,
    mount(
      nextItems: LinkSuggestionItem[],
      command: PopupCommand,
      rect: DOMRect | null | undefined,
    ) {
      items = nextItems;
      onCommand = command;
      selectedIndex = 0;
      render();
      position(rect ?? null);
      document.body.appendChild(element);
    },
    update(
      nextItems: LinkSuggestionItem[],
      command: PopupCommand,
      rect: DOMRect | null | undefined,
    ) {
      items = nextItems;
      onCommand = command;
      if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1);
      render();
      position(rect ?? null);
    },
    // Returns true when the key was handled (so the editor doesn't also act on it).
    onKeyDown(event: KeyboardEvent): boolean {
      if (items.length === 0) {
        // Still swallow Escape so it closes nothing-but-the-popup cleanly elsewhere; let the rest pass.
        return event.key === "Escape";
      }
      if (event.key === "ArrowDown") {
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
        return true;
      }
      if (event.key === "ArrowUp") {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) onCommand(item);
        return true;
      }
      if (event.key === "Escape") return true;
      return false;
    },
    destroy() {
      element.remove();
    },
  };
};

export const buildDocumentLinkSuggestion = (config: { getItems: () => LinkSuggestionItem[] }) =>
  Extension.create({
    name: "documentLinkSuggestion",

    addProseMirrorPlugins() {
      const suggestion: SuggestionOptions<LinkSuggestionItem, LinkSuggestionItem> = {
        editor: this.editor,
        pluginKey: documentLinkSuggestionPluginKey,
        char: "[[",
        // Keys never contain spaces; a space ends the query. `allowedPrefixes: null` lets `[[` trigger
        // anywhere (mid-line, after punctuation), matching Obsidian rather than only after whitespace.
        allowSpaces: false,
        allowedPrefixes: null,
        startOfLine: false,
        items: ({ query }) => filterItems(config.getItems(), query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, buildDocumentLink(props.pathType, props.key))
            .run();
        },
        render: () => {
          let popup: ReturnType<typeof createPopup> | null = null;
          return {
            onStart: (props) => {
              popup = createPopup();
              popup.mount(props.items, props.command, props.clientRect?.());
            },
            onUpdate: (props) => {
              popup?.update(props.items, props.command, props.clientRect?.());
            },
            onKeyDown: (props) => popup?.onKeyDown(props.event) ?? false,
            onExit: () => {
              popup?.destroy();
              popup = null;
            },
          };
        },
      };
      return [Suggestion(suggestion)];
    },
  });
