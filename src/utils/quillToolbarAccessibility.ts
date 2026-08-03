import { SCENE_BREAK_SHORTCUT } from "./quillSceneBreak";

const TOOLBAR_CONTROL_LABELS = [
  [".ql-bold", "Bold"],
  [".ql-italic", "Italic"],
  [".ql-underline", "Underline"],
  [".ql-strike", "Strikethrough"],
  [".ql-blockquote", "Block quote"],
  [".ql-link", "Add or edit link"],
  [".ql-sceneBreak", `Insert scene break (${SCENE_BREAK_SHORTCUT})`],
  [".ql-projectImage", "Insert project image"],
  ['.ql-list[value="ordered"]', "Ordered list"],
  ['.ql-list[value="bullet"]', "Bullet list"],
  ["select.ql-header", "Heading level"],
  [".ql-picker.ql-header .ql-picker-label", "Heading level"],
  [".ql-tooltip input[data-link]", "Link URL"],
  [".ql-tooltip .ql-action", "Apply link"],
  [".ql-tooltip .ql-remove", "Remove link"],
] as const;

function labelElement(element: Element, label: string): void {
  element.setAttribute("aria-label", label);
  element.setAttribute("title", label);
}

export function labelQuillToolbar(root: ParentNode | null): void {
  if (!root) {
    return;
  }

  TOOLBAR_CONTROL_LABELS.forEach(([selector, label]) => {
    root.querySelectorAll(selector).forEach((element) => {
      labelElement(element, label);
    });
  });

  root
    .querySelectorAll<HTMLElement>(
      ".ql-picker.ql-header .ql-picker-item",
    )
    .forEach((element) => {
      const value = element.dataset.value;
      labelElement(element, value ? `Heading ${value}` : "Normal text");
    });
}
