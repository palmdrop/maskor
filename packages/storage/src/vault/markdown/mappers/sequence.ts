import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Sequence, SequenceOrigin } from "@maskor/shared";

export const fromFile = (rawYaml: string, projectUuid: string): Sequence => {
  const data = parseYaml(rawYaml) as Record<string, unknown>;
  return {
    uuid: data.uuid as string,
    name: data.name as string,
    isMain: data.isMain as boolean,
    // Sequences written before the active flag existed default to active.
    active: data.active === undefined ? true : (data.active as boolean),
    ...(data.origin ? { origin: data.origin as SequenceOrigin } : {}),
    projectUuid,
    sections: (data.sections as Array<Record<string, unknown>>).map((section) => ({
      uuid: section.uuid as string,
      name: section.name as string,
      fragments: (section.fragments as Array<Record<string, unknown>>).map((fragment) => ({
        uuid: fragment.uuid as string,
        fragmentUuid: fragment.fragmentUuid as string,
        position: fragment.position as number,
      })),
    })),
  };
};

export const toFile = (sequence: Sequence): string => {
  return stringifyYaml({
    uuid: sequence.uuid,
    name: sequence.name,
    isMain: sequence.isMain,
    active: sequence.active,
    ...(sequence.origin ? { origin: sequence.origin } : {}),
    sections: sequence.sections.map((section) => ({
      uuid: section.uuid,
      name: section.name,
      fragments: section.fragments.map((fragment) => ({
        uuid: fragment.uuid,
        fragmentUuid: fragment.fragmentUuid,
        position: fragment.position,
      })),
    })),
  });
};
