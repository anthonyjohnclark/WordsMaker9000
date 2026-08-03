import Delta from "quill-delta";
import {
  DEFAULT_SCENE_BREAK_STYLE,
  insertSceneBreak,
  normalizeSceneBreakValue,
  SCENE_BREAK_BLOT_NAME,
  SCENE_BREAK_DATA_ATTRIBUTE,
  SCENE_BREAK_SHORTCUT,
  sceneBreakKeyboardBinding,
  sceneBreakClipboardMatcher,
} from "./quillSceneBreak";

describe("Quill semantic scene breaks", () => {
  test("imports a legacy HR as an asterisk scene-break embed", () => {
    const result = sceneBreakClipboardMatcher({
      getAttribute: () => null,
    });

    expect(result).toBeInstanceOf(Delta);
    expect(result.ops).toEqual([
      {
        insert: {
          [SCENE_BREAK_BLOT_NAME]: DEFAULT_SCENE_BREAK_STYLE,
        },
      },
    ]);
  });

  test("preserves an explicit scene-break value for fail-closed publishing", () => {
    const result = sceneBreakClipboardMatcher({
      getAttribute: (name) =>
        name === SCENE_BREAK_DATA_ATTRIBUTE ? "future-style" : null,
    });

    expect(result.ops).toEqual([
      {
        insert: {
          [SCENE_BREAK_BLOT_NAME]: "future-style",
        },
      },
    ]);
    expect(normalizeSceneBreakValue("  asterisks  ")).toBe("asterisks");
  });

  test("inserts a block separator and leaves the cursor after it", () => {
    const calls: unknown[][] = [];
    const quill = {
      getSelection: (...args: unknown[]) => {
        calls.push(["getSelection", ...args]);
        return { index: 8, length: 4 };
      },
      deleteText: (...args: unknown[]) => calls.push(["deleteText", ...args]),
      insertText: (...args: unknown[]) => calls.push(["insertText", ...args]),
      insertEmbed: (...args: unknown[]) => calls.push(["insertEmbed", ...args]),
      setSelection: (...args: unknown[]) =>
        calls.push(["setSelection", ...args]),
    };

    const handled = insertSceneBreak.call({ quill });

    expect(handled).toBe(false);
    expect(calls).toEqual([
      ["getSelection", true],
      ["deleteText", 8, 4, "user"],
      ["insertText", 8, "\n", "user"],
      [
        "insertEmbed",
        9,
        SCENE_BREAK_BLOT_NAME,
        DEFAULT_SCENE_BREAK_STYLE,
        "user",
      ],
      ["setSelection", 10, 0, "silent"],
    ]);
  });

  test("does nothing when the editor has no selection", () => {
    const insertEmbed = jest.fn();
    insertSceneBreak.call({
      quill: {
        getSelection: () => null,
        deleteText: jest.fn(),
        insertText: jest.fn(),
        insertEmbed,
        setSelection: jest.fn(),
      },
    });

    expect(insertEmbed).not.toHaveBeenCalled();
  });

  test("binds Control+Shift+Enter to semantic scene-break insertion", () => {
    expect(SCENE_BREAK_SHORTCUT).toBe("Ctrl+Shift+Enter");
    expect(sceneBreakKeyboardBinding).toMatchObject({
      key: "Enter",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      handler: insertSceneBreak,
    });
  });
});
