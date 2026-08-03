import Delta from "quill-delta";
import {
  insertProjectImage,
  normalizeProjectImageValue,
  PROJECT_IMAGE_BLOT_NAME,
  projectImageClipboardMatcher,
} from "./quillProjectImage";

const image = {
  assetId: "asset-123",
  alt: "A moon above a black lake",
  caption: "Night study",
  decorative: false,
  presentation: "full_width" as const,
};

describe("Quill project images", () => {
  test("imports the semantic figure contract without source paths", () => {
    const attributes: Record<string, string> = {
      "data-wm-asset-id": image.assetId,
      "data-wm-alt": image.alt,
      "data-wm-caption": image.caption,
      "data-wm-decorative": "false",
      "data-wm-image-intent": "full_width",
    };
    const result = projectImageClipboardMatcher(
      {
        classList: { contains: (value) => value === "wm-image" },
        getAttribute: (name) => attributes[name] ?? null,
      },
      new Delta().insert("ignored"),
    );

    expect(result.ops).toEqual([
      { insert: { [PROJECT_IMAGE_BLOT_NAME]: image } },
    ]);
    expect(JSON.stringify(result.ops)).not.toContain("C:\\");
    expect(JSON.stringify(result.ops)).not.toContain("data:image");
  });

  test("leaves unrelated figures unchanged", () => {
    const original = new Delta().insert("legacy figure");
    expect(
      projectImageClipboardMatcher(
        {
          classList: { contains: () => false },
          getAttribute: () => null,
        },
        original,
      ),
    ).toBe(original);
  });

  test("requires a safe asset ID and either alt text or decorative intent", () => {
    expect(normalizeProjectImageValue({ ...image, assetId: "../escape" }).assetId).toBe("");
    const insertEmbed = jest.fn();
    const quill = {
      getSelection: () => ({ index: 4, length: 0 }),
      deleteText: jest.fn(),
      insertText: jest.fn(),
      insertEmbed,
      setSelection: jest.fn(),
    };

    expect(insertProjectImage(quill, { ...image, alt: "" })).toBe(false);
    expect(insertEmbed).not.toHaveBeenCalled();
    expect(
      insertProjectImage(quill, {
        ...image,
        alt: "",
        decorative: true,
      }),
    ).toBe(true);
  });

  test("inserts a block embed and leaves a writable paragraph after it", () => {
    const calls: unknown[][] = [];
    const quill = {
      getSelection: () => ({ index: 7, length: 2 }),
      deleteText: (...args: unknown[]) => calls.push(["deleteText", ...args]),
      insertText: (...args: unknown[]) => calls.push(["insertText", ...args]),
      insertEmbed: (...args: unknown[]) => calls.push(["insertEmbed", ...args]),
      setSelection: (...args: unknown[]) => calls.push(["setSelection", ...args]),
    };

    expect(insertProjectImage(quill, image)).toBe(true);
    expect(calls).toEqual([
      ["deleteText", 7, 2, "user"],
      ["insertText", 7, "\n", "user"],
      ["insertEmbed", 8, PROJECT_IMAGE_BLOT_NAME, image, "user"],
      ["setSelection", 9, 0, "silent"],
    ]);
  });
});
