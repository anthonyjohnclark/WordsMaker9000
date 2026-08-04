import { useMemo, useState } from "react";
import { useModal } from "../../../contexts/global/ModalContext";
import {
  deleteFootnote,
  FootnoteQuill,
  insertFootnote,
  listEditorFootnotes,
  navigateToFootnoteReference,
  updateFootnote,
} from "../../../utils/quillFootnotes";

interface FootnoteModalProps {
  editor: FootnoteQuill;
  insertionSelection: { index: number; length: number } | null;
}

const FootnoteModal = ({ editor, insertionSelection }: FootnoteModalProps) => {
  const modal = useModal();
  const [revision, setRevision] = useState(0);
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const notes = useMemo(
    () => listEditorFootnotes(editor.getContents()),
    [editor, revision],
  );
  const buttonStyle = {
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  };

  const insert = () => {
    if (!insertFootnote(editor, newBody, insertionSelection)) return;
    setNewBody("");
    setRevision((value) => value + 1);
  };

  const saveEdit = () => {
    if (!editingId || !updateFootnote(editor, editingId, editingBody)) return;
    setEditingId(null);
    setEditingBody("");
    setRevision((value) => value + 1);
  };

  return (
    <div className="min-w-[38rem] max-w-[68vw]" style={{ color: "var(--text-primary)" }}>
      <h2 className="text-xl font-bold">Footnotes</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
        Note numbers are assigned from publication order when you publish.
      </p>

      <div className="rounded p-3" style={{ border: "1px solid var(--border-color)" }}>
        <label className="block text-sm font-semibold mb-1" htmlFor="new-footnote-body">
          New footnote
        </label>
        <textarea
          id="new-footnote-body"
          className="w-full rounded p-2"
          style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
          rows={3}
          value={newBody}
          onChange={(event) => setNewBody(event.target.value)}
          placeholder="Enter the note text"
        />
        <div className="flex justify-end mt-2">
          <button
            className="rounded px-3 py-2 font-semibold"
            style={{ background: "var(--accent)", color: "var(--btn-text)", border: "1px solid var(--accent)" }}
            disabled={!insertionSelection || !newBody.trim()}
            onClick={insert}
          >
            Insert at cursor
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 max-h-[45vh] overflow-y-auto">
        {notes.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No footnotes in this file.</p>
        )}
        {notes.map((note, index) => (
          <div key={note.id} className="rounded p-3" style={{ border: "1px solid var(--border-color)" }}>
            <div className="flex items-start gap-3">
              <span className="font-semibold" aria-label={`Footnote ${index + 1}`}>{index + 1}.</span>
              <div className="flex-1 min-w-0">
                {editingId === note.id ? (
                  <textarea
                    className="w-full rounded p-2"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
                    rows={3}
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{note.body || "Definition missing"}</p>
                )}
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>ID: {note.id}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {editingId === note.id ? (
                  <>
                    <button className="rounded px-2 py-1" style={buttonStyle} onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="rounded px-2 py-1" style={buttonStyle} disabled={!editingBody.trim()} onClick={saveEdit}>Save</button>
                  </>
                ) : (
                  <>
                    <button
                      className="rounded px-2 py-1"
                      style={buttonStyle}
                      disabled={note.referenceIndex === null}
                      onClick={() => {
                        if (navigateToFootnoteReference(editor, note.id)) modal.handleClose();
                      }}
                    >
                      Go to
                    </button>
                    <button
                      className="rounded px-2 py-1"
                      style={buttonStyle}
                      disabled={note.definitionIndex === null}
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingBody(note.body);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded px-2 py-1"
                      style={buttonStyle}
                      onClick={() => {
                        if (!window.confirm("Delete this footnote reference and definition?")) return;
                        deleteFootnote(editor, note.id);
                        setRevision((value) => value + 1);
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-5">
        <button className="rounded px-4 py-2" style={buttonStyle} onClick={modal.handleClose}>Done</button>
      </div>
    </div>
  );
};

export default FootnoteModal;
