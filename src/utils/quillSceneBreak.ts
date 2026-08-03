import Delta from "quill-delta";

export const SCENE_BREAK_BLOT_NAME = "sceneBreak";
export const SCENE_BREAK_DATA_ATTRIBUTE = "data-wm-scene-break";
export const DEFAULT_SCENE_BREAK_STYLE = "asterisks";
export const SCENE_BREAK_SHORTCUT = "Ctrl+Shift+Enter";

type SceneBreakRange = {
  index: number;
  length: number;
};

type SceneBreakQuill = {
  getSelection: (focus?: boolean) => SceneBreakRange | null;
  deleteText: (index: number, length: number, source: "user") => unknown;
  insertText: (index: number, text: string, source: "user") => unknown;
  insertEmbed: (
    index: number,
    blotName: string,
    value: string,
    source: "user",
  ) => unknown;
  setSelection: (index: number, length: number, source: "silent") => unknown;
};

type SceneBreakNode = {
  getAttribute: (name: string) => string | null;
};

export function normalizeSceneBreakValue(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_SCENE_BREAK_STYLE;
}

export function sceneBreakClipboardMatcher(node: SceneBreakNode): Delta {
  const style = normalizeSceneBreakValue(
    node.getAttribute(SCENE_BREAK_DATA_ATTRIBUTE),
  );
  return new Delta().insert({ [SCENE_BREAK_BLOT_NAME]: style });
}

export function insertSceneBreak(this: {
  quill: SceneBreakQuill;
}): false {
  const range = this.quill.getSelection(true);
  if (!range) {
    return false;
  }

  if (range.length > 0) {
    this.quill.deleteText(range.index, range.length, "user");
  }

  // The leading newline splits the current paragraph. Inserting the block
  // embed immediately after it leaves Quill's following paragraph writable.
  this.quill.insertText(range.index, "\n", "user");
  this.quill.insertEmbed(
    range.index + 1,
    SCENE_BREAK_BLOT_NAME,
    DEFAULT_SCENE_BREAK_STYLE,
    "user",
  );
  this.quill.setSelection(range.index + 2, 0, "silent");
  return false;
}

export const sceneBreakKeyboardBinding = {
  key: "Enter",
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  handler: insertSceneBreak,
};
