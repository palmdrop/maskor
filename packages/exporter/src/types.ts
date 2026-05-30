// Lean navigation payload — the structure that drives the sidebar. It carries
// no fragment content (the content lives entirely in the assembled markdown
// string), only stable ids and display keys for navigation.
export type NavFragment = {
  uuid: string;
  key: string;
};

export type NavSection = {
  uuid: string;
  name: string;
  fragments: NavFragment[];
};

export type AssembledDocument = {
  markdown: string;
  sections: NavSection[];
};
