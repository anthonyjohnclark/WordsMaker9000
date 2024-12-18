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
import { ExtendedNodeModel, NodeData } from "../types/ProjectPageTypes";
import dynamic from "next/dynamic";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import { useUserSettings } from "WordsMaker9000/app/contexts/global/UserSettingsContext";

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
  const { settings } = useUserSettings();

  const [content, setContent] = useState(initialContent);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fontSize, setFontSize] = useState(settings?.defaultFontZoom || 0); // Default font size in pixels
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent); // Track last saved content

  const project = useProjectContext();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setContent(initialContent);
    setLastSavedContent(initialContent); // Reset lastSavedContent when initial content changes
  }, [initialContent]);

  const handleSave = useCallback(() => {
    onSave(content);
    setLastSavedContent(content); // Update last saved content
    console.log("File auto-saved:", content);
  }, [content, onSave]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (content !== lastSavedContent) {
        handleSave();
      }
    }, settings?.defaultSaveInterval ?? 60000);

    return () => clearInterval(interval);
  }, [content, handleSave, lastSavedContent, settings?.defaultSaveInterval]);

  useEffect(() => {
    const countWords = (text: string): number => {
      return text
        .trim()
        .split(/\s+/)
        .filter((n) => n !== "").length;
    };

    const wordCount = countWords(content || "");

    if (selectedFile?.data) {
      project.setSelectedFile({
        ...project.selectedFile,
        data: {
          ...(project.selectedFile?.data as NodeData),
          wordCount: wordCount,
        },
      } as ExtendedNodeModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

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

  const handleWheelZoom = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
      setFontSize((prevFontSize) => {
        const newFontSize = prevFontSize + (event.deltaY < 0 ? 1 : -1);
        return Math.max(10, Math.min(100, newFontSize));
      });
    }
  };

  useEffect(() => {
    window.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheelZoom);
    };
  }, [fontSize]);

  const modules = useMemo(() => {
    return {
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        [{ size: ["small", false, "large", "huge"] }], // Font size options
        ["clean"],
      ],
    };
  }, []);

  useEffect(() => {
    const quillEditor = editorRef.current?.querySelector(".ql-editor");
    if (quillEditor) {
      (quillEditor as HTMLElement).style.fontSize = `${fontSize}px`;
    }
  }, [fontSize]);

  return (
    <div
      ref={editorRef}
      className={`relative h-full ${isFullScreen ? "fullscreen-editor" : ""}`}
    >
      <FiSave
        onClick={handleSave}
        className="save-icon absolute top-2 right-2 text-yellow-500 cursor-pointer hover:text-blue-400 text-2xl"
        title="Save"
      />

      <p className="italic save-icon absolute top-2 right-20 text-gray-500">
        Ctrl + wheel to zoom
      </p>
      <ReactQuill
        value={content}
        onChange={setContent}
        style={{
          height: `calc(100% - ${isDrawerExpanded ? "3rem" : "3rem"})`,
          fontFamily: "monospace",
          font: "Consola",
        }}
        modules={modules}
      />
    </div>
  );
};

export default TextEditor;
