import Delta from "quill-delta";
import { ProjectImageValue } from "../types/ProjectAssetTypes";

export const PROJECT_IMAGE_BLOT_NAME = "projectImage";
export const PROJECT_IMAGE_CLASS = "wm-image";

export const PROJECT_IMAGE_ATTRIBUTES = {
  assetId: "data-wm-asset-id",
  alt: "data-wm-alt",
  caption: "data-wm-caption",
  decorative: "data-wm-decorative",
  presentation: "data-wm-image-intent",
} as const;

const SAFE_ASSET_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function normalizeProjectImageValue(value: unknown): ProjectImageValue {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Partial<ProjectImageValue>)
      : {};
  const assetId = typeof candidate.assetId === "string" ? candidate.assetId : "";
  return {
    assetId: SAFE_ASSET_ID.test(assetId) ? assetId : "",
    alt: typeof candidate.alt === "string" ? candidate.alt.trim() : "",
    caption:
      typeof candidate.caption === "string" ? candidate.caption.trim() : "",
    decorative: candidate.decorative === true,
    presentation:
      candidate.presentation === "full_width" ? "full_width" : "block",
  };
}

type AttributeNode = {
  classList?: { contains: (value: string) => boolean };
  getAttribute: (name: string) => string | null;
};

export function projectImageValueFromNode(node: AttributeNode): ProjectImageValue {
  return normalizeProjectImageValue({
    assetId: node.getAttribute(PROJECT_IMAGE_ATTRIBUTES.assetId) ?? "",
    alt: node.getAttribute(PROJECT_IMAGE_ATTRIBUTES.alt) ?? "",
    caption: node.getAttribute(PROJECT_IMAGE_ATTRIBUTES.caption) ?? "",
    decorative:
      node.getAttribute(PROJECT_IMAGE_ATTRIBUTES.decorative) === "true",
    presentation:
      node.getAttribute(PROJECT_IMAGE_ATTRIBUTES.presentation) ?? "block",
  });
}

export function projectImageClipboardMatcher(
  node: AttributeNode,
  delta: Delta,
): Delta {
  if (!node.classList?.contains(PROJECT_IMAGE_CLASS)) {
    return delta;
  }
  return new Delta().insert({
    [PROJECT_IMAGE_BLOT_NAME]: projectImageValueFromNode(node),
  });
}

type ImageQuill = {
  getSelection: (focus?: boolean) => { index: number; length: number } | null;
  deleteText: (index: number, length: number, source: "user") => unknown;
  insertText: (index: number, text: string, source: "user") => unknown;
  insertEmbed: (
    index: number,
    blotName: string,
    value: ProjectImageValue,
    source: "user",
  ) => unknown;
  setSelection: (index: number, length: number, source: "silent") => unknown;
};

export function insertProjectImage(
  quill: ImageQuill,
  value: ProjectImageValue,
): boolean {
  const normalized = normalizeProjectImageValue(value);
  const range = quill.getSelection(true);
  if (!range || !normalized.assetId || (!normalized.decorative && !normalized.alt)) {
    return false;
  }
  if (range.length > 0) {
    quill.deleteText(range.index, range.length, "user");
  }
  quill.insertText(range.index, "\n", "user");
  quill.insertEmbed(range.index + 1, PROJECT_IMAGE_BLOT_NAME, normalized, "user");
  quill.setSelection(range.index + 2, 0, "silent");
  return true;
}
