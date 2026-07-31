import Delta from "quill-delta";

export const SOFT_BREAK_BLOT_NAME = "softbreak";

type SoftBreakRange = {
  index: number;
  length: number;
};

type SoftBreakQuill = {
  deleteText: (index: number, length: number, source: "user") => unknown;
  insertEmbed: (
    index: number,
    blotName: string,
    value: true,
    source: "user",
  ) => unknown;
  setSelection: (index: number, length: number, source: "silent") => unknown;
};

export function softBreakClipboardMatcher(): Delta {
  // This matcher runs after Quill's built-in BR matcher and replaces the
  // block-producing newline with the explicit inline embed.
  return new Delta().insert({ [SOFT_BREAK_BLOT_NAME]: true });
}

export function insertSoftBreak(
  this: { quill: SoftBreakQuill },
  range: SoftBreakRange,
): false {
  if (range.length > 0) {
    this.quill.deleteText(range.index, range.length, "user");
  }
  this.quill.insertEmbed(
    range.index,
    SOFT_BREAK_BLOT_NAME,
    true,
    "user",
  );
  this.quill.setSelection(range.index + 1, 0, "silent");
  return false;
}
