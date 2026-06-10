import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@api/generated/projects/projects";
import type { ProjectUpdate } from "@api/generated/maskorAPI.schemas";

// The mutable-via-settings sections of a project, and the dotted `section.field` paths into
// them. Splitting `useProjectSetting`'s key into boolean vs. numeric paths lets `SettingValue`
// pin the value type (and the fallback) at the call site.
type BooleanSettingPath =
  | "editor.vimMode"
  | "editor.rawMarkdownMode"
  | "editor.vimClipboardSync"
  | "advanced.showFragmentStats";

type NumberSettingPath =
  | "editor.fontSize"
  | "editor.maxParagraphWidth"
  | "suggestion.readinessThreshold";

export type SettingPath = BooleanSettingPath | NumberSettingPath;

export type SettingValue<P extends SettingPath> = P extends BooleanSettingPath ? boolean : number;

type SettingSection = "editor" | "suggestion" | "advanced";

export type UseProjectSetting<V> = {
  /** The authoritative server value (falls back to `fallback` until the project loads). */
  value: V;
  /** Commit a value immediately — for switches (boolean settings). */
  set: (value: V) => Promise<void>;
  /** Local draft, for sliders: edit freely, then `commit` on release. Resyncs from the server. */
  draft: V;
  setDraft: (value: V) => void;
  /**
   * Commit the draft — for sliders' `onValueCommit`. Pass the released value explicitly
   * (`commit(value)`) to avoid committing a stale draft before its render flushes; defaults
   * to the current draft.
   */
  commit: (next?: V) => Promise<void>;
  /** True while this setting's own save is in flight. */
  isPending: boolean;
  /** Per-setting error string, surfaced for the row to render; cleared on the next save. */
  error: string | null;
};

// ApiRequestError carries the API's error-body message; fall back gracefully for anything else.
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Update failed.";

/**
 * The write-half sibling to `useProjectEditorConfig`: owns one project setting's save lifecycle
 * — read the current value, hold a draft for sliders, commit via `updateProject` + invalidate,
 * and surface a per-field error. Both the immediate (switch) and draftable (slider) shapes are
 * returned; a call site uses whichever fits. Keyed by a typed `section.field` path.
 *
 * Values are in their stored units (e.g. `suggestion.readinessThreshold` is the 0–1 fraction);
 * any display mapping (percent, etc.) belongs at the control, not here.
 */
export const useProjectSetting = <P extends SettingPath>(
  projectId: string,
  path: P,
  fallback: SettingValue<P>,
): UseProjectSetting<SettingValue<P>> => {
  type V = SettingValue<P>;
  const queryClient = useQueryClient();
  const { data: envelope } = useGetProject(projectId);
  const updateProject = useUpdateProject();
  const [error, setError] = useState<string | null>(null);

  const [section, field] = path.split(".") as [SettingSection, string];
  const project = envelope?.status === 200 ? envelope.data : null;
  const value =
    ((project ? (project[section] as Record<string, unknown>)[field] : undefined) as V) ?? fallback;

  // Resync the draft when the server value changes. Mid-drag the server value is stable (the
  // commit only fires on release), so an in-progress edit is never clobbered.
  const [draft, setDraft] = useState<V>(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitValue = useCallback(
    async (next: V) => {
      setError(null);
      try {
        await updateProject.mutateAsync({
          projectId,
          data: { [section]: { [field]: next } } as ProjectUpdate,
        });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      } catch (caught) {
        setError(errorMessage(caught));
      }
    },
    [updateProject, projectId, section, field, queryClient],
  );

  const set = useCallback((next: V) => commitValue(next), [commitValue]);
  const commit = useCallback((next?: V) => commitValue(next ?? draft), [commitValue, draft]);

  return { value, set, draft, setDraft, commit, isPending: updateProject.isPending, error };
};
