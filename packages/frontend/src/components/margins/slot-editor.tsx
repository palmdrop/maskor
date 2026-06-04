import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vim } from "@replit/codemirror-vim";
import { buildSharedProseExtensions, proseClassName } from "../shared-prose-extensions";

export type EditorMode = "rich" | "vim" | "raw";

// The line-height the Margin text (static comments, notes, and the active slot editors) shares so the
// column reads in the same serif rhythm as the prose editor beside it (margins-4 findings #1, #2).
// Matches the prose body line-height; the document-side push is measured, so equal line-heights keep
// multi-line comments from drifting against their block.
export const MARGIN_LINE_HEIGHT = 1.75;

// CodeMirror's base theme forces a monospace family and its own line padding on `.cm-content` /
// `.cm-scroller`. Override them so the raw/vim comment editor reads in the same serif rhythm as the
// static comment text beside it — no font/spacing jump between viewing and editing (margins-4 #2, #3).
// The wrapper owns the padding, so the editor's own content padding is zeroed.
const slotCmTheme = EditorView.theme({
  "&": { fontFamily: "var(--font-serif)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-serif)",
    lineHeight: String(MARGIN_LINE_HEIGHT),
  },
  ".cm-content": { fontFamily: "var(--font-serif)", padding: "0" },
  ".cm-line": { padding: "0" },
});

type MarkdownStorage = {
  markdown: { getMarkdown: () => string };
};

type Props = {
  value: string;
  mode: EditorMode;
  placeholder?: string;
  // Match the fragment editor's font size so a comment beside a paragraph reads at the same scale and
  // its measured height lines up with the block (ADR 0009).
  fontSize?: number;
  // Focus the editor when it mounts (the slot just became the single active editor).
  focusOnMount?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  // Focus keymap: navigate to the next / previous slot, or return the caret to the bound paragraph.
  onNext?: () => void;
  onPrevious?: () => void;
  onEscape?: () => void;
};

// The single "active" editor of the annotated-paragraphs column (ADR 0008: one active editor; all
// other slots render statically). It follows the fragment editor mode — TipTap in rich mode, CM6
// (with vim) in vim/raw mode — so the focused comment edits in the same idiom as the prose. Enter is
// a newline within the comment; Tab/Shift-Tab move between slots; Escape returns to the prose.
export const SlotEditor = ({
  value,
  mode,
  placeholder,
  fontSize,
  focusOnMount,
  onChange,
  onBlur,
  onNext,
  onPrevious,
  onEscape,
}: Props) => {
  // Tab/Shift-Tab and Escape are column-navigation, not text input — intercept them before the
  // editor. Enter falls through (newline). Arrow up/down navigate only at the text boundaries.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) onPrevious?.();
      else onNext?.();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
    }
  };

  if (mode === "rich") {
    return (
      <RichSlotEditor
        value={value}
        placeholder={placeholder}
        fontSize={fontSize}
        focusOnMount={focusOnMount}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }
  return (
    <CodeSlotEditor
      value={value}
      vimMode={mode === "vim"}
      fontSize={fontSize}
      focusOnMount={focusOnMount}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

const RichSlotEditor = ({
  value,
  placeholder,
  fontSize,
  focusOnMount,
  onChange,
  onBlur,
  onKeyDown,
}: {
  value: string;
  placeholder?: string;
  fontSize?: number;
  focusOnMount?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) => {
  const editor = useEditor({
    extensions: buildSharedProseExtensions(),
    content: value,
    onUpdate: ({ editor: instance }) => {
      onChange((instance.storage as unknown as MarkdownStorage).markdown.getMarkdown());
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        // No `text-sm` (inherit the column `fontSize`) and zero paragraph margins so the rich comment
        // editor matches the static comment text — no size/spacing jump between view and edit
        // (margins-4 #3).
        class: `${proseClassName} focus:outline-none [&_p]:my-0`,
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor && focusOnMount) editor.commands.focus("end");
  }, [editor, focusOnMount]);

  return (
    // The interactive surface is the inner editor; this wrapper only forwards navigation keys.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onKeyDown={onKeyDown}
      style={{
        fontFamily: "var(--font-serif)",
        lineHeight: MARGIN_LINE_HEIGHT,
        ...(fontSize ? { fontSize } : {}),
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};

const CodeSlotEditor = ({
  value,
  vimMode,
  fontSize,
  focusOnMount,
  onChange,
  onBlur,
  onKeyDown,
}: {
  value: string;
  vimMode: boolean;
  fontSize?: number;
  focusOnMount?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) => {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () =>
      vimMode
        ? [markdown(), vim(), EditorView.lineWrapping, slotCmTheme]
        : [markdown(), EditorView.lineWrapping, slotCmTheme],
    [vimMode],
  );

  return (
    // The interactive surface is the inner editor; this wrapper only forwards navigation keys. The
    // raw/vim comment shares the editor's serif family + line-height so its lines keep the same
    // vertical rhythm as the prose beside it (ADR 0009; margins-4 finding #1).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onKeyDown={onKeyDown}
      style={{
        fontFamily: "var(--font-serif)",
        lineHeight: MARGIN_LINE_HEIGHT,
        fontSize: fontSize ? `${fontSize}px` : "0.875rem",
      }}
    >
      <CodeMirror
        ref={ref}
        value={value}
        extensions={extensions}
        onChange={onChange}
        onBlur={() => onBlur?.()}
        onCreateEditor={(view) => {
          if (focusOnMount) view.focus();
        }}
        basicSetup={{ lineNumbers: false, foldGutter: false }}
      />
    </div>
  );
};
