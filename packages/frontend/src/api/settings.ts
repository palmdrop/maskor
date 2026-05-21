export type { SettingsResponse, SettingsPatch } from "./generated/maskorAPI.schemas";
export { getGetSettingsQueryKey as SETTINGS_QUERY_KEY_FN } from "./generated/settings/settings";

export { useGetSettings as useSettings, usePatchSettings } from "./generated/settings/settings";
