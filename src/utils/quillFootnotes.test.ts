import Delta from "quill-delta";
import {
  deleteFootnote,
  FOOTNOTE_DEFINITION_BLOT_NAME,
  FOOTNOTE_REFERENCE_BLOT_NAME,
  footnoteDefinitionClipboardMatcher,
  footnoteReferenceClipboardMatcher,
  insertFootnote,
  listEditorFootnotes,
  navigateToFootnoteReference,
  normalizeFootnoteDefinitionValue,
  updateFootnote,
} from "./quillFootnotes";

const reference = { id: "note-stable" };
const definition = { ...reference, body: "A stable note." };

describe("Quill footnotes", () => {
  test("imports semantic reference and definition data-wm markup", () => {
    const referenceDelta = footnoteReferenceClipboardMatcher(
      {
        classList: { contains: (value) => value === "wm-footnote-reference" },
        getAttribute: (name) =>
          name === "data-wm-footnote-id" ? reference.id : null,
      },
      new Delta().insert("ignored"),
    );
    const definitionDelta = footnoteDefinitionClipboardMatcher(
      {
        classList: { contains: (value) => value === "wm-footnote-definition" },
        getAttribute: (name) =>
          name === "data-wm-footnote-id"
            ? definition.id
            : name === "data-wm-footnote-body"
              ? definition.body
              : null,
      },
      new Delta().insert("ignored"),
    );

    expect(referenceDelta.ops).toEqual([
      { insert: { [FOOTNOTE_REFERENCE_BLOT_NAME]: reference } },
    ]);
    expect(definitionDelta.ops).toEqual([
      { insert: { [FOOTNOTE_DEFINITION_BLOT_NAME]: definition } },
    ]);
  });

  test("rejects unsafe IDs and trims note bodies", () => {
    expect(
      normalizeFootnoteDefinitionValue({ id: "../note", body: " text " }),
    ).toEqual({ id: "", body: "text" });
  });

  test("lists notes in reference order independent of definition order", () => {
    const delta = new Delta()
      .insert({ [FOOTNOTE_DEFINITION_BLOT_NAME]: definition })
      .insert("First")
      .insert({ [FOOTNOTE_REFERENCE_BLOT_NAME]: reference })
      .insert(" then ")
      .insert({ [FOOTNOTE_REFERENCE_BLOT_NAME]: { id: "note-two" } })
      .insert({
        [FOOTNOTE_DEFINITION_BLOT_NAME]: { id: "note-two", body: "Second" },
      });

    expect(listEditorFootnotes(delta).map(({ id, body }) => ({ id, body }))).toEqual([
      { id: "note-stable", body: "A stable note." },
      { id: "note-two", body: "Second" },
    ]);
  });

  test("inserts a stable reference and definition, then supports edit, navigation, and delete", () => {
    let delta = new Delta().insert("Text\n");
    const quill = {
      getContents: () => delta,
      getLength: () => delta.length(),
      getSelection: () => ({ index: 4, length: 0 }),
      deleteText: jest.fn((index: number, length: number) => {
        delta = delta.compose(new Delta().retain(index).delete(length));
      }),
      insertEmbed: jest.fn((index: number, name: string, value: unknown) => {
        delta = delta.compose(new Delta().retain(index).insert({ [name]: value }));
      }),
      insertText: jest.fn((index: number, text: string) => {
        delta = delta.compose(new Delta().retain(index).insert(text));
      }),
      setSelection: jest.fn(),
    };

    expect(insertFootnote(quill, definition.body, undefined, definition.id)).toBe(
      definition.id,
    );
    expect(listEditorFootnotes(delta)[0]).toMatchObject(definition);

    expect(updateFootnote(quill, definition.id, "Edited body")).toBe(true);
    expect(listEditorFootnotes(delta)[0].body).toBe("Edited body");
    expect(navigateToFootnoteReference(quill, definition.id)).toBe(true);
    expect(quill.setSelection).toHaveBeenLastCalledWith(4, 1, "user");

    expect(deleteFootnote(quill, definition.id)).toBe(true);
    expect(listEditorFootnotes(delta)).toEqual([]);
  });
});
