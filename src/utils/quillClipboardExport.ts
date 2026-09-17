import type Quill from "quill";

type ClipboardExportQuill = Pick<
  Quill,
  "getSelection" | "getText" | "getSemanticHTML" | "deleteText" | "root"
>;

// Quill's getSemanticHTML() (used here and by Quill's own default copy
// handler) turns every space into &nbsp;, which is a hard no-wrap point in
// HTML. Rich clipboard consumers like Word/Substack then can't break lines
// at word boundaries and are forced to hard-wrap mid-word instead. Restore
// ordinary breakable spaces, but leave genuine multi-space runs (adjacent
// &nbsp; entities) alone so they still render as multiple spaces.
function restoreBreakableSpaces(html: string): string {
  return html.replace(/(?<!&nbsp;)&nbsp;(?!&nbsp;)/g, " ");
}

function handleClipboardExport(
  quill: ClipboardExportQuill,
  event: ClipboardEvent,
  { isCut }: { isCut: boolean },
): void {
  const range = quill.getSelection();
  if (!range || range.length === 0 || !event.clipboardData) return;

  event.preventDefault();
  const text = quill.getText(range.index, range.length);
  const html = restoreBreakableSpaces(
    quill.getSemanticHTML(range.index, range.length),
  );
  event.clipboardData.setData("text/plain", text);
  event.clipboardData.setData("text/html", html);

  if (isCut) {
    quill.deleteText(range.index, range.length, "user");
  }
}

export function attachClipboardExportFix(
  quill: ClipboardExportQuill,
): () => void {
  const onCopy = (event: ClipboardEvent) =>
    handleClipboardExport(quill, event, { isCut: false });
  const onCut = (event: ClipboardEvent) =>
    handleClipboardExport(quill, event, { isCut: true });

  quill.root.addEventListener("copy", onCopy);
  quill.root.addEventListener("cut", onCut);

  return () => {
    quill.root.removeEventListener("copy", onCopy);
    quill.root.removeEventListener("cut", onCut);
  };
}
