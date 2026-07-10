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
import { BackupFailedBanner } from "./backup-failed-banner";
import { ConflictingBackupBanner } from "./conflicting-backup-banner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { EditorDisplaySettings } from "./editor-display-settings";
import { useDelayedPending } from "@hooks/useDelayedPending";
import { useKeyEdit } from "@hooks/useKeyEdit";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { useDocumentLinks } from "@lib/document-links/useDocumentLinks";
import { buildDocumentLink, resolveLanguage, type FragmentLanguageCode } from "@maskor/shared";
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
  // Apply a pending swap recovery that was held back because it conflicts (the server advanced since
  // the backup was written). Used by the linked swap pair's "Restore backup" so the fragment side and
  // the Margin restore together. No-op when there is no recovery or it was already applied.
  restoreBackup: () => void;
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
  // Per-entity writing-language override (fragments only). Absent/undefined inherits the project
  // language; a concrete code overrides it for spell-check.
  fragmentLanguage?: FragmentLanguageCode;
  // When true, this shell does not render its own unsaved-recovery banner — a parent coordinates a
  // single banner for a linked swap pair (fragment ↔ Margin). Fragment recovery is still applied.
  // The same flag suppresses the shell's own backup-failed banner, reported up instead.
  suppressRecoveryBanner?: boolean;
  // When true, hold back this shell's non-conflicting recovery auto-apply — the linked swap pair is
  // in conflict (or its status is not yet fully known) on the OTHER side, so applying this side now
  // would tear the pair (one side showing backup content, the other server content) before the user
  // chooses. Held recoveries are never marked applied, so the pair's explicit "Restore backup"
  // (`restoreBackup()`) still applies them, and "Keep server version" (`restoreFromServer()`) reverts
  // them. A conflicting recovery is already held regardless of this flag. Default false — non-pair
  // shells (notes/references/aspects) never set it and keep the immediate auto-apply.
  holdRecovery?: boolean;
  // Reports the fragment swap recovery up to a coordinating parent (linked swap pair). `isConflict`
  // marks a backup whose baseline no longer matches the server (multi-tab-swap-hardening, Phase 3).
  onRecoveryChange?: (recovery: { at: Date; isConflict: boolean } | null) => void;
  // Reports whether this shell's swap read has settled (recovery status known) up to a coordinating
  // parent, so a linked pair can hold both sides until each side's status is resolved.
  onRecoverySettledChange?: (settled: boolean) => void;
  // Reports whether this entity's swap write is currently failing, up to a coordinating parent so a
  // linked swap pair (fragment ↔ Margin) can surface one combined "not backed up" warning.
  onBackupFailedChange?: (failed: boolean) => void;
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
      fragmentLanguage,
      suppressRecoveryBanner = false,
      holdRecovery = false,
      onRecoveryChange,
      onRecoverySettledChange,
      onBackupFailedChange,
    },
    ref,
  ) {
    const editorConfig = useProjectEditorConfig(projectId);
    // The fragment override wins over the project language; non-fragment editors pass no override.
    const resolvedLanguage = resolveLanguage(fragmentLanguage, editorConfig.language);
    // Document-link resolution + navigation for the prose editor (resolved/broken styling, Cmd-click).
    const documentLinks = useDocumentLinks(projectId);
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

    const {
      recovery,
      clear: clearSwap,
      backupFailed,
      recoverySettled,
    } = useEntityContentSwap({
      projectId,
      entityType: entityKind,
      entityUUID,
      currentValue: liveContent,
      serverValue: content,
    });

    // Report swap-backup failure up so a coordinating parent (the fragment editor's linked
    // fragment ↔ Margin pair) can surface one combined warning. Ref so a fresh callback identity
    // each render doesn't re-fire the effect.
    const onBackupFailedChangeRef = useRef(onBackupFailedChange);
    onBackupFailedChangeRef.current = onBackupFailedChange;
    useEffect(() => {
      onBackupFailedChangeRef.current?.(backupFailed);
    }, [backupFailed]);

    const recoveryAppliedRef = useRef(false);
    // Tracks the explicit choice made on a conflicting backup (multi-tab-swap-hardening, Phase 3):
    // once the user picked, the conflict banner goes away for this entity. "kept" also clears the
    // swap (recovery goes null), so the state mainly hides the banner after "restored".
    const [conflictResolution, setConflictResolution] = useState<"restored" | "kept" | null>(null);
    useEffect(() => {
      // Reset the per-entity guards when the swap target changes.
      recoveryAppliedRef.current = false;
      setConflictResolution(null);
    }, [projectId, entityKind, entityUUID]);

    // Consumers pass a fresh onProseChange each render; ref it so the recovery
    // effect doesn't re-run (no-op or otherwise) on every parent render.
    const onProseChangeRef = useRef(onProseChange);
    onProseChangeRef.current = onProseChange;

    useEffect(() => {
      if (!recovery) return;
      // A conflicting backup (the server advanced since it was written — another tab saved, or an
      // external edit) is never auto-applied: doing so would silently revert the newer work. The
      // buffer keeps the current server content until the user explicitly chooses (banner below /
      // the linked pair's coordinated banner).
      if (recovery.isConflict) return;
      // The linked swap pair holds both non-conflicting sides while the pair is in conflict (or its
      // status is still resolving) on the other side — applying now would tear the pair. Return
      // WITHOUT marking applied so a later release (holdRecovery → false) or the explicit "Restore
      // backup" still applies it. Re-runs when holdRecovery flips (it's in the deps).
      if (holdRecovery) return;
      if (recoveryAppliedRef.current) return;
      recoveryAppliedRef.current = true;
      proseEditorRef.current?.setContent(recovery.content);
      setLiveContent(recovery.content);
      onProseChangeRef.current();
    }, [recovery, holdRecovery]);

    // The explicit "Restore backup" choice for a conflicting recovery: apply the held-back backup
    // into the buffer and mark it dirty (buffer authority then protects it; save persists it over
    // the newer server version, which is exactly what the user chose).
    const handleRestoreBackup = useCallback(() => {
      if (!recovery) return;
      if (!recoveryAppliedRef.current) {
        recoveryAppliedRef.current = true;
        proseEditorRef.current?.setContent(recovery.content);
        setLiveContent(recovery.content);
        onProseChangeRef.current();
      }
      setConflictResolution("restored");
    }, [recovery]);

    const handleRestoreFromServer = useCallback(() => {
      proseEditorRef.current?.setContent(content);
      setLiveContent(content);
      // Hide a conflict banner immediately — clearSwap() nulls the recovery only after the DELETE
      // round-trip settles.
      setConflictResolution("kept");
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
        restoreBackup: () => handleRestoreBackup(),
      }),
      [saveContent, handleRestoreFromServer, handleRestoreBackup],
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
      linkTargets: documentLinks.entities,
      insertLink: (target) =>
        proseEditorRef.current?.insertAtCursor(buildDocumentLink(target.pathType, target.key)),
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
      onRecoveryChangeRef.current?.(
        recovery ? { at: recovery.at, isConflict: recovery.isConflict } : null,
      );
    }, [recovery]);

    // Report the swap-read settled state up so the linked pair can hold both sides until each side's
    // recovery status is known (see holdRecovery). Ref'd so a fresh callback identity doesn't re-fire.
    const onRecoverySettledChangeRef = useRef(onRecoverySettledChange);
    onRecoverySettledChangeRef.current = onRecoverySettledChange;
    useEffect(() => {
      onRecoverySettledChangeRef.current?.(recoverySettled);
    }, [recoverySettled]);

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
        isDirty={isDirty}
        vimMode={editorConfig.vimMode}
        rawMarkdownMode={editorConfig.rawMarkdownMode}
        fontSize={fontSize.draft}
        maxParagraphWidth={maxParagraphWidth.draft}
        vimClipboardSync={vimClipboardSync.value}
        language={resolvedLanguage}
        onSave={() => commands.run("editor:save")}
        onChange={handleProseChange}
        onActiveBlockChange={onActiveBlockChange}
        cursor={cursor}
        linkLookups={documentLinks.lookups}
        onNavigateLink={documentLinks.navigateToLink}
        // Open the command palette aimed at the insert-link entity picker (the command owns cursor
        // restoration). `command-palette:open` carries the target command id as an untyped runtime arg
        // — see its definition — so this single call site passes it through a cast.
        onInsertLink={() =>
          (commands.run as (id: string, arg?: unknown) => void)(
            "command-palette:open",
            "editor:insert-link",
          )
        }
      />
    );

    return (
      <div className={rootClassName} style={rootStyle}>
        {recovery &&
          !suppressRecoveryBanner &&
          (recovery.isConflict ? (
            conflictResolution === null && (
              <ConflictingBackupBanner
                cachedAt={recovery.at}
                onRestoreBackup={handleRestoreBackup}
                onDiscardBackup={handleRestoreFromServer}
              />
            )
          ) : (
            <UnsavedRecoveryBanner cachedAt={recovery.at} onDismiss={handleRestoreFromServer} />
          ))}
        {backupFailed && !suppressRecoveryBanner && <BackupFailedBanner />}
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
            //   [ small left gutter (4rem) | prose (auto) | margin (1fr, leftover) ]
            // The prose column is `auto`, sized to its own width (`maxParagraphWidth`ch). The Margin is
            // the only flexible (`1fr`) track, so it takes *leftover* space after the prose has claimed
            // its width — the editor body therefore takes precedence: when the prose is wide the Margin
            // shrinks (down to 0) instead of being pushed out, and when there is room the Margin grows,
            // capped at a sensible width (`max-w-[34rem]`) so it never balloons mostly-empty. The Margin
            // track's min is 0, so the grid can never blow out past the container; leftover beyond the
            // cap sits to the far right. The `ch` unit resolves against the prose column's own font
            // size, so it is set there. Stacks below `lg`.
            <div className="flex flex-1 min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[4rem_auto_minmax(0,1fr)] lg:gap-0">
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
              <div className="flex w-full min-w-0 flex-col min-h-0 border-t border-border/50 pt-4 lg:col-start-3 lg:w-full lg:max-w-[34rem] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
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
