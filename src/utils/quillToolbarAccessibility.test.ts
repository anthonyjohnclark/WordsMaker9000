import { labelQuillToolbar } from "./quillToolbarAccessibility";

type FakeElement = {
  attributes: Record<string, string>;
  dataset: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
};

function element(dataset: Record<string, string> = {}): FakeElement {
  const attributes: Record<string, string> = {};
  return {
    attributes,
    dataset,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
  };
}

describe("Quill toolbar accessibility labels", () => {
  test("labels formatting controls, link actions, and every heading choice", () => {
    const sceneBreak = element();
    const projectImage = element();
    const link = element();
    const applyLink = element();
    const headingPicker = element();
    const normalHeading = element();
    const levelTwoHeading = element({ value: "2" });

    const matches = new Map<string, FakeElement[]>([
      [".ql-sceneBreak", [sceneBreak]],
      [".ql-projectImage", [projectImage]],
      [".ql-link", [link]],
      [".ql-tooltip .ql-action", [applyLink]],
      [".ql-picker.ql-header .ql-picker-label", [headingPicker]],
      [
        ".ql-picker.ql-header .ql-picker-item",
        [normalHeading, levelTwoHeading],
      ],
    ]);
    const root = {
      querySelectorAll: (selector: string) => matches.get(selector) ?? [],
    } as unknown as ParentNode;

    labelQuillToolbar(root);

    expect(sceneBreak.attributes).toMatchObject({
      "aria-label": "Insert scene break (Ctrl+Shift+Enter)",
      title: "Insert scene break (Ctrl+Shift+Enter)",
    });
    expect(link.attributes["aria-label"]).toBe("Add or edit link");
    expect(projectImage.attributes["aria-label"]).toBe("Insert project image");
    expect(applyLink.attributes["aria-label"]).toBe("Apply link");
    expect(headingPicker.attributes["aria-label"]).toBe("Heading level");
    expect(normalHeading.attributes["aria-label"]).toBe("Normal text");
    expect(levelTwoHeading.attributes["aria-label"]).toBe("Heading 2");
  });
});
