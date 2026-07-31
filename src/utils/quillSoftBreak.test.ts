import Delta from "quill-delta";
import {
  insertSoftBreak,
  SOFT_BREAK_BLOT_NAME,
  softBreakClipboardMatcher,
} from "./quillSoftBreak";

describe("Quill soft breaks", () => {
  test("imports BR as an inline soft-break embed", () => {
    const result = softBreakClipboardMatcher();

    expect(result).toBeInstanceOf(Delta);
    expect(result.ops).toEqual([
      {
        insert: {
          [SOFT_BREAK_BLOT_NAME]: true,
        },
      },
    ]);
  });

  test("Shift+Enter replaces the selection and keeps the cursor inline", () => {
    const calls: unknown[][] = [];
    const quill = {
      deleteText: (...args: unknown[]) => calls.push(["deleteText", ...args]),
      insertEmbed: (...args: unknown[]) => calls.push(["insertEmbed", ...args]),
      setSelection: (...args: unknown[]) =>
        calls.push(["setSelection", ...args]),
    };

    const handled = insertSoftBreak.call(
      { quill },
      {
        index: 12,
        length: 3,
      },
    );

    expect(handled).toBe(false);
    expect(calls).toEqual([
      ["deleteText", 12, 3, "user"],
      ["insertEmbed", 12, SOFT_BREAK_BLOT_NAME, true, "user"],
      ["setSelection", 13, 0, "silent"],
    ]);
  });

  test("Shift+Enter does not issue a zero-length delete", () => {
    const deleteText = jest.fn();
    const insertEmbed = jest.fn();
    const setSelection = jest.fn();

    insertSoftBreak.call(
      { quill: { deleteText, insertEmbed, setSelection } },
      { index: 2, length: 0 },
    );

    expect(deleteText).not.toHaveBeenCalled();
    expect(insertEmbed).toHaveBeenCalledWith(
      2,
      SOFT_BREAK_BLOT_NAME,
      true,
      "user",
    );
    expect(setSelection).toHaveBeenCalledWith(3, 0, "silent");
  });
});
