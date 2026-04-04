import type { Fragment, FragmentProperties } from "../domain/fragment";
import type { Piece } from "../domain/piece";

// TODO: investigate frameworks for standardized APIs
export type FragmentsApi = {
  // Fetching

  // FragmentUUID?
  get(uuid: string): Promise<Fragment>;
  get(uuids: string[]): Promise<Fragment>[];

  // project UUID?
  getAll<R extends Partial<Fragment>>(select?: R, filter?: (fragment: R) => boolean): Promise<R[]>;

  // Update
  updateMetadata(
    uuid: string,
    fragment: Omit<Fragment, "uuid" | "version" | "title" | "updatedAt">,
  ): Promise<boolean>;

  updateProperties(uuid: string, properties: FragmentProperties): Promise<boolean>;

  // Removing
  discardFragment(uuid: string): Promise<boolean>;

  // Adding
  addFragment(piece?: Piece): Promise<Fragment>;
};
