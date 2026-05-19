export type CommandCategory = "navigation" | "create" | "project" | "other";

export type CommandScope = "global" | string;

export interface CommandArg<T = unknown> {
  items: T[] | (() => T[] | Promise<T[]>);
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem?: (item: T) => React.ReactNode;
  placeholder?: string;
}

export interface CommandDef<T = unknown> {
  id: string;
  label: string;
  scope: CommandScope;
  category: CommandCategory;
  hotkey?: string;
  arg?: CommandArg<T>;
  disabledReason?: string;
  run: (arg?: T) => void | Promise<void>;
}
