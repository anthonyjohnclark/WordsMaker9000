import { EmbedBlot } from "parchment";
import { Quill } from "react-quill-new";
import {
  normalizeProjectImageValue,
  PROJECT_IMAGE_ATTRIBUTES,
  PROJECT_IMAGE_BLOT_NAME,
  PROJECT_IMAGE_CLASS,
  projectImageValueFromNode,
} from "./quillProjectImage";

const BlockEmbedBlot = Quill.import("blots/block/embed") as typeof EmbedBlot;

export class ProjectImageBlot extends BlockEmbedBlot {
  static blotName = PROJECT_IMAGE_BLOT_NAME;
  static tagName = "FIGURE";
  static className = PROJECT_IMAGE_CLASS;

  static create(value?: unknown): HTMLElement {
    const normalized = normalizeProjectImageValue(value);
    const node = super.create(value) as HTMLElement;
    node.setAttribute(PROJECT_IMAGE_ATTRIBUTES.assetId, normalized.assetId);
    node.setAttribute(PROJECT_IMAGE_ATTRIBUTES.alt, normalized.alt);
    node.setAttribute(PROJECT_IMAGE_ATTRIBUTES.caption, normalized.caption);
    node.setAttribute(
      PROJECT_IMAGE_ATTRIBUTES.decorative,
      String(normalized.decorative),
    );
    node.setAttribute(
      PROJECT_IMAGE_ATTRIBUTES.presentation,
      normalized.presentation,
    );
    node.setAttribute("contenteditable", "false");
    node.setAttribute("role", normalized.decorative ? "presentation" : "img");
    if (!normalized.decorative) {
      node.setAttribute("aria-label", normalized.alt);
    }

    const placeholder = document.createElement("span");
    placeholder.className = "wm-image-placeholder";
    placeholder.textContent = normalized.decorative
      ? "Decorative image"
      : `Image: ${normalized.alt}`;
    node.appendChild(placeholder);
    if (normalized.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = normalized.caption;
      node.appendChild(caption);
    }
    return node;
  }

  static value(node: HTMLElement) {
    return projectImageValueFromNode(node);
  }
}
