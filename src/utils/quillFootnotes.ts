import Delta from "quill-delta";
import { v4 as uuidv4 } from "uuid";
import {
  EditorFootnote,
  FootnoteDefinitionValue,
  FootnoteReferenceValue,
} from "../types/FootnoteTypes";

export const FOOTNOTE_REFERENCE_BLOT_NAME = "footnoteReference";
export const FOOTNOTE_DEFINITION_BLOT_NAME = "footnoteDefinition";
export const FOOTNOTE_REFERENCE_CLASS = "wm-footnote-reference";
export const FOOTNOTE_DEFINITION_CLASS = "wm-footnote-definition";

export const FOOTNOTE_ATTRIBUTES = {
  id: "data-wm-footnote-id",
  body: "data-wm-footnote-body",
} as const;

const SAFE_FOOTNOTE_ID = /^[A-Za-z0-9_-]{1,100}$/;

type AttributeNode = {
  classList?: { contains: (value: string) => boolean };
  getAttribute: (name: string) => string | null;
};

type DeltaLike = {
  ops?: Array<{ insert?: unknown }>;
};

export type FootnoteQuill = {
  getContents: () => DeltaLike;
  getLength: () => number;
  getSelection: (focus?: boolean) => { index: number; length: number } | null;
  deleteText: (
    index: number,
    length: number,
    source: "user",
  ) => unknown;
  insertEmbed: (
    index: number,
    blotName: string,
    value: FootnoteReferenceValue | FootnoteDefinitionValue,
    source: "user",
  ) => unknown;
  insertText: (index: number, text: string, source: "user") => unknown;
  setSelection: (
    index: number,
    length: number,
    source: "silent" | "user",
  ) => unknown;
};

export function createFootnoteId(): string {
  return `note-${uuidv4().replace(/-/g, "")}`;
}

export function normalizeFootnoteReferenceValue(
  value: unknown,
): FootnoteReferenceValue {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Partial<FootnoteReferenceValue>)
      : {};
  const id = typeof candidate.id === "string" ? candidate.id : "";
  return { id: SAFE_FOOTNOTE_ID.test(id) ? id : "" };
}

export function normalizeFootnoteDefinitionValue(
  value: unknown,
): FootnoteDefinitionValue {
  const reference = normalizeFootnoteReferenceValue(value);
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Partial<FootnoteDefinitionValue>)
      : {};
  return {
    ...reference,
    body: typeof candidate.body === "string" ? candidate.body.trim() : "",
  };
}

export function footnoteReferenceValueFromNode(
  node: AttributeNode,
): FootnoteReferenceValue {
  return normalizeFootnoteReferenceValue({
    id: node.getAttribute(FOOTNOTE_ATTRIBUTES.id) ?? "",
  });
}

export function footnoteDefinitionValueFromNode(
  node: AttributeNode,
): FootnoteDefinitionValue {
  return normalizeFootnoteDefinitionValue({
    id: node.getAttribute(FOOTNOTE_ATTRIBUTES.id) ?? "",
    body: node.getAttribute(FOOTNOTE_ATTRIBUTES.body) ?? "",
  });
}

export function footnoteReferenceClipboardMatcher(
  node: AttributeNode,
  delta: Delta,
): Delta {
  if (!node.classList?.contains(FOOTNOTE_REFERENCE_CLASS)) {
    return delta;
  }
  return new Delta().insert({
    [FOOTNOTE_REFERENCE_BLOT_NAME]: footnoteReferenceValueFromNode(node),
  });
}

export function footnoteDefinitionClipboardMatcher(
  node: AttributeNode,
  delta: Delta,
): Delta {
  if (!node.classList?.contains(FOOTNOTE_DEFINITION_CLASS)) {
    return delta;
  }
  return new Delta().insert({
    [FOOTNOTE_DEFINITION_BLOT_NAME]: footnoteDefinitionValueFromNode(node),
  });
}

function insertLength(insert: unknown): number {
  return typeof insert === "string" ? insert.length : insert ? 1 : 0;
}

export function listEditorFootnotes(delta: DeltaLike): EditorFootnote[] {
  const notes = new Map<string, EditorFootnote>();
  let index = 0;
  for (const operation of delta.ops ?? []) {
    const insert = operation.insert;
    if (typeof insert === "object" && insert !== null) {
      const embeds = insert as Record<string, unknown>;
      if (FOOTNOTE_REFERENCE_BLOT_NAME in embeds) {
        const value = normalizeFootnoteReferenceValue(
          embeds[FOOTNOTE_REFERENCE_BLOT_NAME],
        );
        if (value.id) {
          const current = notes.get(value.id) ?? {
            id: value.id,
            body: "",
            referenceIndex: null,
            definitionIndex: null,
          };
          if (current.referenceIndex === null) current.referenceIndex = index;
          notes.set(value.id, current);
        }
      }
      if (FOOTNOTE_DEFINITION_BLOT_NAME in embeds) {
        const value = normalizeFootnoteDefinitionValue(
          embeds[FOOTNOTE_DEFINITION_BLOT_NAME],
        );
        if (value.id) {
          const current = notes.get(value.id) ?? {
            id: value.id,
            body: "",
            referenceIndex: null,
            definitionIndex: null,
          };
          current.body = value.body;
          if (current.definitionIndex === null) current.definitionIndex = index;
          notes.set(value.id, current);
        }
      }
    }
    index += insertLength(insert);
  }
  return [...notes.values()].sort((left, right) => {
    const leftIndex = left.referenceIndex ?? left.definitionIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.referenceIndex ?? right.definitionIndex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export function insertFootnote(
  quill: FootnoteQuill,
  body: string,
  selection = quill.getSelection(true),
  id = createFootnoteId(),
): string | null {
  const normalized = normalizeFootnoteDefinitionValue({ id, body });
  if (!selection || !normalized.id || !normalized.body) return null;
  if (selection.length > 0) {
    quill.deleteText(selection.index, selection.length, "user");
  }
  quill.insertEmbed(
    selection.index,
    FOOTNOTE_REFERENCE_BLOT_NAME,
    { id: normalized.id },
    "user",
  );
  const definitionIndex = Math.max(selection.index + 1, quill.getLength() - 1);
  quill.insertEmbed(
    definitionIndex,
    FOOTNOTE_DEFINITION_BLOT_NAME,
    normalized,
    "user",
  );
  quill.insertText(definitionIndex + 1, "\n", "user");
  quill.setSelection(selection.index + 1, 0, "silent");
  return normalized.id;
}

export function updateFootnote(
  quill: FootnoteQuill,
  id: string,
  body: string,
): boolean {
  const note = listEditorFootnotes(quill.getContents()).find(
    (candidate) => candidate.id === id,
  );
  const normalized = normalizeFootnoteDefinitionValue({ id, body });
  if (!note || note.definitionIndex === null || !normalized.body) return false;
  quill.deleteText(note.definitionIndex, 1, "user");
  quill.insertEmbed(
    note.definitionIndex,
    FOOTNOTE_DEFINITION_BLOT_NAME,
    normalized,
    "user",
  );
  return true;
}

export function navigateToFootnoteReference(
  quill: FootnoteQuill,
  id: string,
): boolean {
  const note = listEditorFootnotes(quill.getContents()).find(
    (candidate) => candidate.id === id,
  );
  if (!note || note.referenceIndex === null) return false;
  quill.setSelection(note.referenceIndex, 1, "user");
  return true;
}

export function deleteFootnote(quill: FootnoteQuill, id: string): boolean {
  const note = listEditorFootnotes(quill.getContents()).find(
    (candidate) => candidate.id === id,
  );
  if (!note) return false;
  const positions = [note.referenceIndex, note.definitionIndex]
    .filter((index): index is number => index !== null)
    .sort((left, right) => right - left);
  positions.forEach((index) => quill.deleteText(index, 1, "user"));
  return positions.length > 0;
}
