export type DictionarySelectionRange = {
  index: number;
  length: number;
};

type QuillTextReader = {
  getText: (index: number, length: number) => string;
};

const WORD_CHARACTER = /[\p{L}\p{M}'’-]/u;

/**
 * Checks the characters immediately beside a Quill selection without losing
 * the positional space occupied by embeds such as soft and scene breaks.
 */
export function hasWholeWordBoundaries(
  editor: QuillTextReader,
  selection: DictionarySelectionRange,
): boolean {
  if (selection.length <= 0) return false;

  const before =
    selection.index > 0 ? editor.getText(selection.index - 1, 1) : "";
  const after = editor.getText(selection.index + selection.length, 1);

  return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
}
