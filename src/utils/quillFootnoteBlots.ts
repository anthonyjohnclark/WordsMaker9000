import { EmbedBlot } from "parchment";
import { Quill } from "react-quill-new";
import {
  FOOTNOTE_ATTRIBUTES,
  FOOTNOTE_DEFINITION_BLOT_NAME,
  FOOTNOTE_DEFINITION_CLASS,
  FOOTNOTE_REFERENCE_BLOT_NAME,
  FOOTNOTE_REFERENCE_CLASS,
  footnoteDefinitionValueFromNode,
  footnoteReferenceValueFromNode,
  normalizeFootnoteDefinitionValue,
  normalizeFootnoteReferenceValue,
} from "./quillFootnotes";

const InlineEmbedBlot = Quill.import("blots/embed") as typeof EmbedBlot;
const BlockEmbedBlot = Quill.import("blots/block/embed") as typeof EmbedBlot;

export class FootnoteReferenceBlot extends InlineEmbedBlot {
  static blotName = FOOTNOTE_REFERENCE_BLOT_NAME;
  static tagName = "SUP";
  static className = FOOTNOTE_REFERENCE_CLASS;

  static create(value?: unknown): HTMLElement {
    const normalized = normalizeFootnoteReferenceValue(value);
    const node = super.create(value) as HTMLElement;
    node.setAttribute(FOOTNOTE_ATTRIBUTES.id, normalized.id);
    node.setAttribute("contenteditable", "false");
    node.setAttribute("role", "doc-noteref");
    node.setAttribute("aria-label", "Footnote reference");
    node.textContent = "note";
    return node;
  }

  static value(node: HTMLElement) {
    return footnoteReferenceValueFromNode(node);
  }
}

export class FootnoteDefinitionBlot extends BlockEmbedBlot {
  static blotName = FOOTNOTE_DEFINITION_BLOT_NAME;
  static tagName = "ASIDE";
  static className = FOOTNOTE_DEFINITION_CLASS;

  static create(value?: unknown): HTMLElement {
    const normalized = normalizeFootnoteDefinitionValue(value);
    const node = super.create(value) as HTMLElement;
    node.setAttribute(FOOTNOTE_ATTRIBUTES.id, normalized.id);
    node.setAttribute(FOOTNOTE_ATTRIBUTES.body, normalized.body);
    node.setAttribute("contenteditable", "false");
    node.setAttribute("role", "doc-footnote");

    const label = document.createElement("strong");
    label.textContent = "Footnote: ";
    node.appendChild(label);
    const body = document.createElement("span");
    body.textContent = normalized.body;
    node.appendChild(body);
    return node;
  }

  static value(node: HTMLElement) {
    return footnoteDefinitionValueFromNode(node);
  }
}
