import { Quill } from "react-quill-new";
import { smartQuoteChar, convertToCurlyQuotes } from "./smartTypography";

class SmartTypography {
  private quill: Quill;
  private options: Record<string, unknown>;

  constructor(quill: Quill, options: Record<string, unknown> = {}) {
    this.quill = quill;
    this.options = options;
    this.quill.root.addEventListener("keydown", this.handleKeyDown);
    this.quill.clipboard.addMatcher(Node.TEXT_NODE, (_node, delta) => {
      delta.ops.forEach((op) => {
        if (typeof op.insert === "string") {
          op.insert = convertToCurlyQuotes(op.insert);
        }
      });
      return delta;
    });
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const selection = this.quill.getSelection();
    if (!selection) return;

    const index = selection.index;
    const length = selection.length;

    if (event.key === '"' || event.key === "'") {
      event.preventDefault();

      if (length > 0) {
        this.quill.deleteText(index, length, "user");
      }

      const prevChar = index > 0 ? this.quill.getText(index - 1, 1) : null;
      const char = smartQuoteChar(prevChar, event.key as '"' | "'");

      this.quill.insertText(index, char, "user");
      this.quill.setSelection(index + 1, "user");
      return;
    }

    if (event.key === "-") {
      const prevChar = index > 0 ? this.quill.getText(index - 1, 1) : null;
      if (prevChar === "-") {
        event.preventDefault();

        if (length > 0) {
          this.quill.deleteText(index, length, "user");
        }

        this.quill.deleteText(index - 1, 1, "user");
        this.quill.insertText(index - 1, "—", "user");
        this.quill.setSelection(index, "user");
      }
    }
  };
}

Quill.register("modules/smartTypography", SmartTypography);
