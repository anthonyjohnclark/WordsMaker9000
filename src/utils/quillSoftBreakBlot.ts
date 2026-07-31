import { EmbedBlot } from "parchment";
import { SOFT_BREAK_BLOT_NAME } from "./quillSoftBreak";

export class SoftBreakBlot extends EmbedBlot {
  static blotName = SOFT_BREAK_BLOT_NAME;
  static tagName = "BR";

  static value(): true {
    return true;
  }
}
