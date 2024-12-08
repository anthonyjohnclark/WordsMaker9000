"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { FiSave } from "react-icons/fi";
import "react-quill-new/dist/quill.snow.css";
import { ExtendedNodeModel } from "../types/ProjectPageTypes";
import dynamic from "next/dynamic";

type TextEditorProps = {
  initialContent: string;
  onSave: (content: string) => void;
  selectedFile: ExtendedNodeModel | null;
  isDrawerExpanded: boolean;
};

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const TextEditor: React.FC<TextEditorProps> = ({
  initialContent,
  onSave,
  selectedFile,
  isDrawerExpanded,
}) => {
  const [content, setContent] = useState(initialContent);
  const [isFullScreen, setIsFullScreen] = useState(false); // Track full-screen mode
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = useCallback(() => {
    if (content !== null) {
      onSave(content);
      console.log("File auto-saved:", content);
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

  // Handle full-screen toggle with F11
  useEffect(() => {
    const handleFullScreenShortcut = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        const element = editorRef.current;
        if (element) {
          if (!document.fullscreenElement) {
            element.requestFullscreen().catch(console.error);
            setIsFullScreen(true);
          } else {
            document.exitFullscreen().catch(console.error);
            setIsFullScreen(false);
          }
        }
      }
    };

    window.addEventListener("keydown", handleFullScreenShortcut);
    return () => {
      window.removeEventListener("keydown", handleFullScreenShortcut);
    };
  }, []);

  const modules = useMemo(() => {
    return {
      toolbar: [
        ["bold", "italic", "underline", "strike"], // Basic formatting
        [{ list: "ordered" }, { list: "bullet" }], // Lists
        ["link", "image"], // Link and image
        ["clean"], // Remove formatting
      ],
    };
  }, []);

  return (
    <div
      ref={editorRef}
      className={`relative h-full ${isFullScreen ? "fullscreen-editor" : ""}`}
    >
      {/* Save Icon */}
      {/* Save Icon */}
      <FiSave
        onClick={handleSave}
        className="save-icon absolute top-2 right-2 text-blue-600 cursor-pointer hover:text-blue-400 text-2xl"
        title="Save"
      />

      {/* Text Editor */}
      <ReactQuill
        value={content}
        onChange={setContent}
        style={{
          height: `calc(100% - ${isDrawerExpanded ? "3rem" : "3rem"})`,
        }}
        modules={modules} // Always include toolbar configuration
      />
    </div>
  );
};

export default TextEditor;
