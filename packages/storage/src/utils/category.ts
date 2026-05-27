import path from "node:path";

// Derives the entity's category from its entity-relative path. The category is the
// containing subfolder, slash-separated; entities at the entity-type root have no category.
// Uses POSIX-style forward slashes regardless of host OS so values stay portable in
// vault frontmatter and DB rows.
export const deriveCategory = (entityRelativePath: string): string | undefined => {
  const directory = path.posix.dirname(entityRelativePath.split(path.sep).join("/"));
  if (directory === "." || directory === "") return undefined;
  return directory;
};

// Joins a category and a key into an entity-relative path. Mirrors deriveCategory.
export const joinCategoryPath = (category: string | undefined, key: string): string => {
  return category ? `${category}/${key}.md` : `${key}.md`;
};
