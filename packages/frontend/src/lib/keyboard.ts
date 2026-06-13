// True when the event target is a text-entry surface — a native field, an ARIA
// text/combobox/searchbox, or a contentEditable. Used to suppress global-ish
// keyboard shortcuts (e.g. ↑/↓ fragment sorting) while the user is typing, where
// those keys carry their own meaning.
export const isTextEntryTarget = (element: HTMLElement): boolean => {
  if (element.isContentEditable) return true;

  const tagName = element.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;

  const role = element.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
};
