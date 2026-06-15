import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ProseEditor,
  type ProseEditorHandle,
  type SelectionCapture,
  type EditorBlock,
} from "./prose-editor";
import { Maximize2, Minimize2 } from "lucide-react";
import { UnsavedRecoveryBanner } from "./unsaved-recovery-banner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { EditorDisplaySettings } from "./editor-display-settings";
import { useDelayedPending } from "@hooks/useDelayedPending";
import { useKeyEdit } from "@hooks/useKeyEdit";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { useProjectSetting } from "@hooks/useProjectSetting";
import { usePersistedBoolean } from "@hooks/usePersistedBoolean";
import { usePersistedCursor } from "@hooks/usePersistedCursor";
import { useEntityContentSwap, type SwapEntityKind } from "@hooks/useEntityContentSwap";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { editorScope } from "@lib/commands/scopes/editor";
import { ExtractToEntityDialog } from "./extract-to-entity-dialog";
import { AppendOrPrependDialog } from "./append-or-prepend-dialog";
import { type EntityKind } from "@lib/entity-kinds/registry";
import { useEntityInsertExtract } from "@lib/entity-kinds/useEntityInsertExtract";
import { useCommands } from "../lib/commands/useCommands";

export type EntityEditorShellHandle = {
  save: () => Promise<void>;
  getSelection: () => SelectionCapture;
  getCurrentBlock: () => { text: string; markerId: string | null; index: number } | null;
  addAnchorAtBlock: (blockIndex: number, markerId: string) => void;
  removeAnchor: (markerId: string) => void;
  revealAnchor: (markerId: string) => void;
  focusAnchorBlock: (markerId: string) => void;
  getScrollElement: () => HTMLElement | null;
  getBlocks: () => EditorBlock[];
  setHighlightedAnchor: (markerId: string | null) => void;
  // Reset the prose buffer to the server content and clear the fragment swap. Used by the linked
  // swap pair so a single "restore from server" reverts both fragment and Margin atomically.
  restoreFromServer: () => void;
};

type Props = {
  label: string;
  projectId: string;
  entityKind: SwapEntityKind;
  entityUUID: string;
  entityKey: string;
  content: string;
  isPending: boolean;
  isDirty: boolean;
  backNode?: ReactNode;
  banner?: ReactNode;
  sidebar?: ReactNode;
  sidebarCollapsible?: boolean;
  // When true, the editor offers a focus toggle that lifts it into a fixed,
  // chrome-hiding overlay below the navbar. Per-project persisted. Only the
  // fragment editor enables it today.
  enableFocusMode?: boolean;
  // An optional panel rendered beside the prose editor (the fragment's Margin surface).
  rightPanel?: ReactNode;
  extraActions?: ReactNode;
  cascadeWarnings?: string[];
  onDismissWarnings?: () => void;
  onProseChange: () => void;
  onSaved: () => void;
  onContentRevert?: () => void;
  onKeySave: (key: string) => Promise<void>;
  onContentSave: (content: string) => Promise<void>;
  // Live prose content on every edit — lets a paired Margin panel track the fragment's anchor
  // markers (for comment ordering and orphan detection).
  onLiveContentChange?: (content: string) => void;
  // The comment markerId of the block the caret is in (or null) — lets a paired Margin highlight the
  // matching comment (the reciprocal connection cue).
  onActiveBlockChange?: (markerId: string | null) => void;
  // When true, this shell does not render its own unsaved-recovery banner — a parent coordinates a
  // single banner for a linked swap pair (fragment ↔ Margin). Fragment recovery is still applied.
  suppressRecoveryBanner?: boolean;
  // Reports the fragment swap recovery up to a coordinating parent (linked swap pair).
  onRecoveryChange?: (recovery: { at: Date } | null) => void;
};

export const EntityEditorShell = forwardRef<EntityEditorShellHandle, Props>(
  function EntityEditorShell(
    {
      label,
      projectId,
      entityKind,
      entityUUID,
      entityKey,
      content,
      isPending,
      isDirty,
      backNode,
      banner,
      sidebar,
      sidebarCollapsible = false,
      enableFocusMode = false,
      rightPanel,
      extraActions,
      cascadeWarnings,
      onDismissWarnings,
      onProseChange,
      onSaved,
      onContentRevert,
      onKeySave,
      onContentSave,
      onLiveContentChange,
      onActiveBlockChange,
      suppressRecoveryBanner = false,
      onRecoveryChange,
    },
    ref,
  ) {
    const editorConfig = useProjectEditorConfig(projectId);
    // Cursor position is persisted per editing mode — switching mode reads that
    // mode's own slot (or starts from the top), and offsets aren't comparable
    // across the CodeMirror/ProseMirror backends anyway.
    const editorMode = editorConfig.vimMode ? "vim" : editorConfig.rawMarkdownMode ? "raw" : "rich";

    // Display settings own their save lifecycle (draft during drag, commit on release, resync
    // from server) — the same hook GeneralTab uses, so the write path lives in one place.
    const fontSize = useProjectSetting(projectId, "editor.fontSize", 16);
    const marginFontSize = useProjectSetting(projectId, "editor.marginFontSize", 15);
    const maxParagraphWidth = useProjectSetting(projectId, "editor.maxParagraphWidth", 72);
    const vimClipboardSync = useProjectSetting(projectId, "editor.vimClipboardSync", true);

    // The +/- commands set the draft for instant feedback, then commit the stepped value.
    const stepFontSize = useCallback(
      (delta: number) => {
        const next = Math.min(Math.max(fontSize.value + delta, 12), 24);
        fontSize.setDraft(next);
        void fontSize.commit(next);
      },
      [fontSize],
    );

    const stepMargin = useCallback(
      (delta: number) => {
        const next = Math.min(Math.max(maxParagraphWidth.value + delta, 40), 120);
        maxParagraphWidth.setDraft(next);
        void maxParagraphWidth.commit(next);
      },
      [maxParagraphWidth],
    );

    const handleIncreaseFontSize = useCallback(() => stepFontSize(1), [stepFontSize]);
    const handleDecreaseFontSize = useCallback(() => stepFontSize(-1), [stepFontSize]);
    const handleIncreaseMargin = useCallback(() => stepMargin(4), [stepMargin]);
    const handleDecreaseMargin = useCallback(() => stepMargin(-4), [stepMargin]);

    const cursor = usePersistedCursor(
      `maskor:cursor:${projectId}:${entityKind}:${entityUUID}:${editorMode}`,
    );
    const proseEditorRef = useRef<ProseEditorHandle>(null);
    const showSaving = useDelayedPending(isPending);

    const sourceKind = entityKind as EntityKind;
    const insertExtract = useEntityInsertExtract(projectId, sourceKind, entityUUID);

    // Track the live editor content so useEntityContentSwap can debounce-write it.
    // Re-reads from the editor on every onProseChange so the swap matches what's
    // on screen.
    const [liveContent, setLiveContent] = useState(content);

    useEffect(() => {
      // Re-sync from the server when we're not dirty (e.g. server data refetched
      // while the editor was clean). Pending edits must not be clobbered.
      if (!isDirty) setLiveContent(content);
    }, [content, isDirty]);

    const { recovery, clear: clearSwap } = useEntityContentSwap({
      projectId,
      entityType: entityKind,
      entityUUID,
      currentValue: liveContent,
      serverValue: content,
    });

    const recoveryAppliedRef = useRef(false);
    useEffect(() => {
      // Reset the per-entity guard when the swap target changes.
      recoveryAppliedRef.current = false;
    }, [projectId, entityKind, entityUUID]);

    // Consumers pass a fresh onProseChange each render; ref it so the recovery
    // effect doesn't re-run (no-op or otherwise) on every parent render.
    const onProseChangeRef = useRef(onProseChange);
    onProseChangeRef.current = onProseChange;

    useEffect(() => {
      if (!recovery) return;
      if (recoveryAppliedRef.current) return;
      recoveryAppliedRef.current = true;
      proseEditorRef.current?.setContent(recovery.content);
      setLiveContent(recovery.content);
      onProseChangeRef.current();
    }, [recovery]);

    const handleRestoreFromServer = useCallback(() => {
      proseEditorRef.current?.setContent(content);
      setLiveContent(content);
      void clearSwap();
      onContentRevert?.();
    }, [content, clearSwap, onContentRevert]);

    const [isSidebarCollapsed, , toggleSidebar] = usePersistedBoolean(
      `entityEditorSidebar_${label}`,
      false,
    );

    // Focus mode is per-project and shared across editor surfaces — an explicit
    // setting, default off, honored on mount, never auto-forced. Toggling it only
    // changes this root's presentation (a fixed overlay), so the editor never
    // remounts and the unsaved buffer + cursor are preserved across the toggle.
    const [isFocusMode, , toggleFocusMode] = usePersistedBoolean(`editorFocus_${projectId}`, false);

    const {
      keyEditing,
      keyValue,
      setKeyValue,
      keyError,
      keyInputRef,
      startEditing,
      cancelEditing,
      handleKeySave,
    } = useKeyEdit({ currentKey: entityKey, isPending, onRename: onKeySave });

    // Save that throws on failure — used by imperative callers (e.g. SuggestionModePage Next).
    const saveContent = useCallback(async () => {
      if (!isDirty || isPending) return;
      const currentContent = proseEditorRef.current?.getContent() ?? content;
      const metadataUpdate = await onContentSave(currentContent);
      // Swap is preserved on failure — onContentSave throws on non-2xx, so this
      // line only runs if the canonical save succeeded.
      await clearSwap(); // TODO: should frontend worry about swap? or is that just a backend concern?
      onSaved();
      return metadataUpdate;
    }, [isDirty, isPending, content, onContentSave, onSaved, clearSwap]);

    // Command-dispatched save (editor:save). Rejects on failure so the command
    // system surfaces the toast and the backend-recorded command:error entry.
    // isDirty stays true on failure because onSaved (which clears it) only runs
    // after a successful save inside saveContent.
    const handleContentSave = useCallback(async () => {
      await saveContent();
    }, [saveContent]);

    useImperativeHandle(
      ref,
      () => ({
        save: saveContent,
        getSelection: () => proseEditorRef.current?.getSelection() ?? { text: "", isEmpty: true },
        getCurrentBlock: () => proseEditorRef.current?.getCurrentBlock() ?? null,
        addAnchorAtBlock: (blockIndex: number, markerId: string) =>
          proseEditorRef.current?.addAnchorAtBlock(blockIndex, markerId),
        removeAnchor: (markerId: string) => proseEditorRef.current?.removeAnchor(markerId),
        revealAnchor: (markerId: string) => proseEditorRef.current?.revealAnchor(markerId),
        focusAnchorBlock: (markerId: string) => proseEditorRef.current?.focusAnchorBlock(markerId),
        getScrollElement: () => proseEditorRef.current?.getScrollElement() ?? null,
        getBlocks: () => proseEditorRef.current?.getBlocks() ?? [],
        setHighlightedAnchor: (markerId: string | null) =>
          proseEditorRef.current?.setHighlightedAnchor(markerId),
        restoreFromServer: () => handleRestoreFromServer(),
      }),
      [saveContent, handleRestoreFromServer],
    );

    const getEditorSelection = useCallback(
      () => proseEditorRef.current?.getSelection() ?? { text: "", isEmpty: true },
      [],
    );

    const commands = useCommands();

    useCommandScope(editorScope, {
      getSelection: getEditorSelection,
      eligibleByKind: insertExtract.eligibleByKind,
      extractTo: insertExtract.extractTo,
      insertTo: insertExtract.insertTo,
      canSave: isDirty && !isPending,
      save: handleContentSave,
      focusMode: enableFocusMode ? { isOn: isFocusMode, toggle: toggleFocusMode } : undefined,
      fontSize: fontSize.draft,
      maxParagraphWidth: maxParagraphWidth.draft,
      increaseFontSize: handleIncreaseFontSize,
      decreaseFontSize: handleDecreaseFontSize,
      increaseMargin: handleIncreaseMargin,
      decreaseMargin: handleDecreaseMargin,
    });

    const handleProseChange = useCallback(() => {
      const current = proseEditorRef.current?.getContent();
      if (current !== undefined) {
        setLiveContent(current);
        onLiveContentChange?.(current);
      }
      onProseChange();
    }, [onProseChange, onLiveContentChange]);

    // Report fragment swap recovery to a coordinating parent (linked swap pair). Re-fires only when
    // the recovery identity changes.
    const onRecoveryChangeRef = useRef(onRecoveryChange);
    onRecoveryChangeRef.current = onRecoveryChange;
    useEffect(() => {
      onRecoveryChangeRef.current?.(recovery ? { at: recovery.at } : null);
    }, [recovery]);

    // Focus mode lifts the same root into a fixed overlay that starts below the
    // navbar (via --app-navbar-height, set by ProjectShellLayout) and covers the
    // host's chrome. Only CSS changes — the React tree is untouched, so no remount.
    const rootClassName = isFocusMode
      ? "flex flex-col gap-2 fixed inset-x-0 bottom-0 z-40 overflow-hidden bg-background px-4 pb-4 pt-2"
      : "flex flex-col h-full gap-2";
    const rootStyle = isFocusMode ? { top: "var(--app-navbar-height, 0px)" } : undefined;

    const proseEditor = (
      <ProseEditor
        ref={proseEditorRef}
        content={content}
        vimMode={editorConfig.vimMode}
        rawMarkdownMode={editorConfig.rawMarkdownMode}
        fontSize={fontSize.draft}
        maxParagraphWidth={maxParagraphWidth.draft}
        vimClipboardSync={vimClipboardSync.value}
        onSave={() => commands.run("editor:save")}
        onChange={handleProseChange}
        onActiveBlockChange={onActiveBlockChange}
        cursor={cursor}
      />
    );

    return (
      <div className={rootClassName} style={rootStyle}>
        {recovery && !suppressRecoveryBanner && (
          <UnsavedRecoveryBanner cachedAt={recovery.at} onDismiss={handleRestoreFromServer} />
        )}
        {banner}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {backNode}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              {keyEditing ? (
                <Input
                  ref={keyInputRef}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  onBlur={handleKeySave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleKeySave();
                    if (e.key === "Escape") cancelEditing();
                  }}
                  disabled={isPending}
                />
              ) : (
                <button
                  className="text-left font-sans font-medium text-2xl hover:opacity-70 transition-opacity"
                  onClick={startEditing}
                >
                  {entityKey}
                </button>
              )}
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {extraActions}
            {enableFocusMode && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => commands.run("editor:toggle-focus")}
                aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}
                title={isFocusMode ? "Exit focus mode" : "Focus mode"}
              >
                {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </Button>
            )}
            <EditorDisplaySettings
              fontSize={fontSize.draft}
              marginFontSize={marginFontSize.draft}
              maxParagraphWidth={maxParagraphWidth.draft}
              onFontSizeChange={fontSize.setDraft}
              onFontSizeCommit={(value) => void fontSize.commit(value)}
              onMarginFontSizeChange={marginFontSize.setDraft}
              onMarginFontSizeCommit={(value) => void marginFontSize.commit(value)}
              onMaxParagraphWidthChange={maxParagraphWidth.setDraft}
              onMaxParagraphWidthCommit={(value) => void maxParagraphWidth.commit(value)}
              vimMode={editorConfig.vimMode}
              vimClipboardSync={vimClipboardSync.value}
              onToggleVimClipboardSync={(checked) => void vimClipboardSync.set(checked)}
            />
            <Button
              size="sm"
              disabled={isPending || !isDirty}
              onClick={() => commands.run("editor:save")}
              className="min-w-20"
            >
              {showSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <Separator />
        {cascadeWarnings && cascadeWarnings.length > 0 && (
          <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {label} renamed in {cascadeWarnings.length} related file
              {cascadeWarnings.length > 1 ? "s" : ""}.
            </span>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={onDismissWarnings}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {sidebar && (
            <div className="flex shrink-0 flex-row items-start gap-1">
              {sidebarCollapsible && (
                <button
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleSidebar}
                  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isSidebarCollapsed ? "▶" : "◀"}
                </button>
              )}
              <div
                className="overflow-hidden transition-all duration-200"
                style={
                  sidebarCollapsible ? { width: isSidebarCollapsed ? 0 : undefined } : undefined
                }
              >
                <aside className="lg:w-72 overflow-y-auto p-1">{sidebar}</aside>
              </div>
            </div>
          )}
          {rightPanel ? (
            // Editor + Margin laid out as a 3-column grid on `lg`:
            //   [ small left gutter | prose (auto) | margin (grows) ]
            // The left gutter is capped small (`minmax(0,12rem)`) so it never mirrors the margin and
            // strands space on the left. The prose column is sized to its own width
            // (`maxParagraphWidth`ch). The Margin column grows from a usable floor up to a sensible cap
            // (`minmax(24rem,34rem)`) and the Margin element fills it (`w-full`), so when there is room
            // the Margin widens and pushes the prose left rather than leaving the left empty. Both
            // gutter tracks are length-bounded (no `1fr`), so on ultra-wide screens leftover space sits
            // to the far right and the grid can never blow out past the container. The `ch` unit
            // resolves against the prose column's own font size, so it is set there. Stacks below `lg`.
            <div className="flex flex-1 min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,12rem)_auto_minmax(24rem,34rem)] lg:gap-0">
              <main
                className="w-full min-w-0 min-h-0 overflow-y-auto lg:col-start-2 lg:w-(--prose-width) lg:max-w-full"
                style={
                  {
                    "--prose-width": `${maxParagraphWidth.draft}ch`,
                    fontSize: `${fontSize.draft}px`,
                  } as CSSProperties
                }
              >
                {proseEditor}
              </main>
              {/* A faint vertical separator with padding keeps the editor and Margin reading as two
                  seamless pieces of text (margins-4 #12). */}
              <div className="flex w-full min-w-0 flex-col min-h-0 border-t border-border/50 pt-4 lg:col-start-3 lg:w-full lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                {rightPanel}
              </div>
            </div>
          ) : (
            <main className="flex-1 min-h-0 overflow-y-auto">{proseEditor}</main>
          )}
        </div>
        {insertExtract.extract.target && insertExtract.extract.bundle && (
          <ExtractToEntityDialog
            open={true}
            bundle={insertExtract.extract.bundle}
            projectId={projectId}
            sourceUuid={entityUUID}
            sourceKind={sourceKind}
            selectionText={insertExtract.extract.selectionText}
            onClose={insertExtract.extract.close}
            onSuccess={insertExtract.extract.onSuccess}
          />
        )}
        {insertExtract.insert.target && (
          <AppendOrPrependDialog
            open={true}
            direction={insertExtract.insert.target.direction}
            targetType={insertExtract.insert.target.targetKind}
            targetKey={insertExtract.insert.target.targetEntity.key}
            selectionText={insertExtract.insert.selectionText}
            sourceMode={insertExtract.insert.sourceMode}
            nextMode={insertExtract.insert.nextMode}
            isPending={insertExtract.insert.isPending}
            onSourceModeChange={insertExtract.insert.setSourceMode}
            onNextModeChange={insertExtract.insert.setNextMode}
            onClose={insertExtract.insert.close}
            onConfirm={insertExtract.insert.confirm}
          />
        )}
      </div>
    );
  },
);
