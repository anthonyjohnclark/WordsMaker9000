import { EmbedBlot } from "parchment";
import { Quill } from "react-quill-new";
import {
  normalizeSceneBreakValue,
  SCENE_BREAK_BLOT_NAME,
  SCENE_BREAK_DATA_ATTRIBUTE,
} from "./quillSceneBreak";

const BlockEmbedBlot = Quill.import(
  "blots/block/embed",
) as typeof EmbedBlot;

export class SceneBreakBlot extends BlockEmbedBlot {
  static blotName = SCENE_BREAK_BLOT_NAME;
  static tagName = "HR";
  static className = "wm-scene-break";

  static create(value?: unknown): HTMLElement {
    const node = super.create(value) as HTMLElement;
    node.setAttribute(
      SCENE_BREAK_DATA_ATTRIBUTE,
      normalizeSceneBreakValue(value),
    );
    node.setAttribute("role", "separator");
    node.setAttribute("aria-label", "Scene break");
    return node;
  }

  static value(node: HTMLElement): string {
    return normalizeSceneBreakValue(
      node.getAttribute(SCENE_BREAK_DATA_ATTRIBUTE),
    );
  }
}
