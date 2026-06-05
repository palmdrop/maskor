// Shared drag-and-drop id helpers for the Overview reorder surface. Section
// drag ids are prefixed so they can be distinguished from fragment ids (plain
// uuids) and the pool drop zone in a single dnd-kit context.

export const POOL_ZONE_ID = "pool-zone";

export const SECTION_ID_PREFIX = "section:";
export const toSectionDragId = (uuid: string) => `${SECTION_ID_PREFIX}${uuid}`;
export const fromSectionDragId = (id: string) => id.slice(SECTION_ID_PREFIX.length);
export const isSectionDragId = (id: string) => id.startsWith(SECTION_ID_PREFIX);
