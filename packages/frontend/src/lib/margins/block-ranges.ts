// Character ranges [from, to) of each blank-line-separated block in document order. Used to place
// document-side spacers and to measure block geometry in raw/vim (CM6) mode, where a block is the
// markdown notion of a paragraph (a run of non-blank lines).
export const blockRanges = (text: string): { from: number; to: number }[] => {
  const ranges: { from: number; to: number }[] = [];
  const regex = /(^|\n)([ \t]*\S[^\n]*(?:\n[ \t]*\S[^\n]*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const lead = match[1]?.length ?? 0;
    const from = match.index + lead;
    ranges.push({ from, to: from + (match[2]?.length ?? 0) });
  }
  return ranges;
};
