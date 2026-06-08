import { useRef, useCallback } from "react";
import { ProseEditor, type ProseEditorHandle } from "./prose-editor";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";

type Props = {
  projectId: string;
  content: string;
  onSave: (content: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving: boolean;
};

// Minimal text-only inline editor for a single fragment body. Wraps ProseEditor
// with a save/cancel footer and keyboard shortcuts. No metadata, no margin panel,
// no key rename, no extract/insert — body edit only.
export const InlineFragmentEditor = ({ projectId, content, onSave, onCancel, isSaving }: Props) => {
  const editorRef = useRef<ProseEditorHandle>(null);
  const { vimMode, rawMarkdownMode, fontSize, maxParagraphWidth, vimClipboardSync } =
    useProjectEditorConfig(projectId);

  const handleSave = useCallback(() => {
    const current = editorRef.current?.getContent() ?? content;
    void onSave(current);
  }, [onSave, content]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleKeyDown}>
      <div className="min-h-[200px]">
        <ProseEditor
          ref={editorRef}
          content={content}
          vimMode={vimMode}
          rawMarkdownMode={rawMarkdownMode}
          fontSize={fontSize}
          maxParagraphWidth={maxParagraphWidth}
          vimClipboardSync={vimClipboardSync}
          onSave={handleSave}
        />
      </div>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-xs text-muted-foreground">⌘↵ to save, Esc to cancel</span>
      </div>
    </div>
  );
};
