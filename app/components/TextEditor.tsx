"use client";

import React, { useEffect, useState } from "react";
import ReactQuill from "react-quill-new";
import { FiSave } from "react-icons/fi";

import "react-quill-new/dist/quill.snow.css";
import { ExtendedNodeModel } from "../projects/[projectName]/ProjectPageClient";

type TextEditorProps = {
  initialContent: string;
  onSave: (content: string) => void;
  selectedFile: ExtendedNodeModel;
};

const TextEditor: React.FC<TextEditorProps> = ({
  initialContent,
  onSave,
  selectedFile,
}) => {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "s") {
        event.preventDefault();
        if (selectedFile && content !== null) {
          onSave(content);
        }
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [content, onSave, selectedFile]);

  return (
    <div className="relative">
      {/* Save Icon */}
      <FiSave
        onClick={() => onSave(content)}
        className="absolute top-2 right-2 text-blue-600 cursor-pointer hover:text-blue-400 text-2xl"
        title="Save"
      />
      {/* Text Editor */}
      <ReactQuill value={content} onChange={setContent} />
    </div>
  );
};

export default TextEditor;
