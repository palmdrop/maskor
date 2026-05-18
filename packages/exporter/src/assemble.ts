import type { Fragment, AssembledSequence } from "@maskor/shared";

type SequenceInput = {
  uuid: string;
  name: string;
  isMain: boolean;
  sections: Array<{
    uuid: string;
    name: string;
    fragments: Array<{
      uuid: string;
      fragmentUuid: string;
      position: number;
    }>;
  }>;
};

export const assembleSequence = (
  sequence: SequenceInput,
  fragments: Fragment[],
): AssembledSequence => {
  const fragmentMap = new Map(fragments.map((fragment) => [fragment.uuid, fragment]));

  const sections = sequence.sections.map((section) => {
    const sorted = [...section.fragments].sort((a, b) => a.position - b.position);

    const assembledFragments = sorted.flatMap((position) => {
      const fragment = fragmentMap.get(position.fragmentUuid);

      if (!fragment) {
        console.warn(
          `[assembleSequence] Fragment ${position.fragmentUuid} not found — skipping (structural drift).`,
        );
        return [];
      }

      if (fragment.isDiscarded) {
        return [];
      }

      return [{ uuid: fragment.uuid, key: fragment.key, content: fragment.content }];
    });

    return { uuid: section.uuid, name: section.name, fragments: assembledFragments };
  });

  return {
    sequenceUuid: sequence.uuid,
    sequenceName: sequence.name,
    isMain: sequence.isMain,
    sections,
  };
};
