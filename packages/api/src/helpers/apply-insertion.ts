export type InsertionPosition = "append" | "prepend";

export const applyInsertion = (
  existingBody: string,
  insertedBody: string,
  position: InsertionPosition,
): string => {
  if (existingBody.trim() === "") {
    return insertedBody;
  }
  if (position === "append") {
    return `${existingBody.trimEnd()}\n\n${insertedBody}`;
  }
  return `${insertedBody}\n\n${existingBody.trimStart()}`;
};
