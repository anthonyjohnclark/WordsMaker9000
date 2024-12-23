import React, { useEffect, useState, useRef, useMemo } from "react";
import { FiSave } from "react-icons/fi";
import { useUserSettings } from "../../contexts/global/UserSettingsContext";
import { useAIContext } from "../../contexts/pages/AIContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { convertToCurlyQuotes } from "../../utils/helpers";
import DiffView from "../DiffView";
import ReactQuill from "react-quill-new";
import "../../styles/quill.snow.css";

type TextEditorProps = {
  selectedFile: ExtendedNodeModel | null;
  isDrawerExpanded: boolean;
};

const TextEditor: React.FC<TextEditorProps> = ({
  selectedFile,
  isDrawerExpanded,
}) => {
  const { settings } = useUserSettings();
  const { content, setContent } = useAIContext();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fontSize, setFontSize] = useState(settings?.defaultFontZoom || 0); // Default font size in pixels
  const editorRef = useRef<HTMLDivElement | null>(null);

  console.log(content);

  const { showDiff } = useAIContext();

  const project = useProjectContext();

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
          project.saveFileContent(content);
        }
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [content, project, project.saveFileContent, selectedFile]);

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
        onClick={() => project.saveFileContent(content)}
        className="save-icon absolute top-2 right-2 text-yellow-500 cursor-pointer hover:text-blue-400 text-2xl"
        title="Save"
      />

      <p className="italic save-icon absolute top-2 right-20 text-gray-500">
        Ctrl + wheel to zoom
      </p>

      {showDiff ? (
        <DiffView
        // original={content}
        // updated={proofreadContent}
        // onAccept={handleAccept}
        />
      ) : (
        <ReactQuill
          value={convertToCurlyQuotes(content)}
          onChange={(newContent) => {
            const processedContent = convertToCurlyQuotes(newContent); // Process for curly quotes/apostrophes
            setContent(processedContent);
          }}
          style={{
            height: `calc(100% - ${isDrawerExpanded ? "3rem" : "3rem"})`,
            fontFamily: "monospace",
            font: "Consola",
          }}
          modules={modules}
        />
      )}
    </div>
  );
};

export default TextEditor;
