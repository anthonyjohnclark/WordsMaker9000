"use client";

import React, { useEffect, useState, useCallback } from "react";
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

  const handleSave = useCallback(() => {
    if (content !== null) {
      onSave(content);
      console.log("File auto-saved:", content);

      setTimeout(() => {}, 3000);
    }
  }, [content, onSave]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleSave(); // Auto-save every minute
    }, 60000);

    return () => clearInterval(interval); // Cleanup interval
  }, [handleSave]);

  // Save content on Ctrl+S
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "s") {
        event.preventDefault();
        if (selectedFile && content !== null) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [content, handleSave, selectedFile]);

  return (
    <div className="relative">
      {/* Save Icon */}
      <FiSave
        onClick={handleSave}
        className="absolute top-2 right-2 text-blue-600 cursor-pointer hover:text-blue-400 text-2xl"
        title="Save"
      />

      {/* Text Editor */}
      <ReactQuill value={content} onChange={setContent} />
    </div>
  );
};

export default TextEditor;
