export interface FootnoteReferenceValue {
  id: string;
}

export interface FootnoteDefinitionValue extends FootnoteReferenceValue {
  body: string;
}

export interface EditorFootnote extends FootnoteDefinitionValue {
  referenceIndex: number | null;
  definitionIndex: number | null;
}
