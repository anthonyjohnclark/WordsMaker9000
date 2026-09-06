import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { FiSave } from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUserSettings } from "../../contexts/global/UserSettingsContext";
import { useErrorContext } from "../../contexts/global/ErrorContext";
import { useEditorContext } from "../../contexts/pages/EditorContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { useModal } from "../../contexts/global/ModalContext";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { convertToCurlyQuotes } from "../../utils/helpers";
import { normalizeWord } from "../../agents/dictionaryAgent";
import DefinitionModal from "./DefinitionModal";
import FindBar from "./FindBar";
import "../../utils/quillSmartTypography";
import ReactQuill, { Quill } from "react-quill-new";
import {
  insertSoftBreak,
  softBreakClipboardMatcher,
} from "../../utils/quillSoftBreak";
import { SoftBreakBlot } from "../../utils/quillSoftBreakBlot";
import {
  insertSceneBreak,
  sceneBreakKeyboardBinding,
  sceneBreakClipboardMatcher,
} from "../../utils/quillSceneBreak";
import { SceneBreakBlot } from "../../utils/quillSceneBreakBlot";
import {
  insertProjectImage,
  projectImageClipboardMatcher,
} from "../../utils/quillProjectImage";
import { ProjectImageBlot } from "../../utils/quillProjectImageBlot";
import { ProjectImageValue } from "../../types/ProjectAssetTypes";
import {
  footnoteDefinitionClipboardMatcher,
  footnoteReferenceClipboardMatcher,
} from "../../utils/quillFootnotes";
import {
  FootnoteDefinitionBlot,
  FootnoteReferenceBlot,
} from "../../utils/quillFootnoteBlots";
import { labelQuillToolbar } from "../../utils/quillToolbarAccessibility";
import { hasWholeWordBoundaries } from "../../utils/dictionarySelection";
import ProjectAssetModal from "./modals/ProjectAssetModal";
import FootnoteModal from "./modals/FootnoteModal";
import "../../styles/quill.snow.css";

Quill.register(SoftBreakBlot, true);
Quill.register(SceneBreakBlot, true);
Quill.register(ProjectImageBlot, true);
Quill.register(FootnoteReferenceBlot, true);
Quill.register(FootnoteDefinitionBlot, true);

type TextEditorProps = {
  selectedFile: ExtendedNodeModel | null;
  isDrawerExpanded: boolean;
  isActive?: boolean;
};

const getEditorBackgroundRgba = (): [number, number, number, number] => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--editor-bg")
    .trim()
    .replace(/^#/, "");
  const rgb = Number.parseInt(value, 16);

  return Number.isNaN(rgb)
    ? [0, 0, 0, 255]
    : [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
};

const TextEditor: React.FC<TextEditorProps> = ({
  selectedFile,
  isDrawerExpanded,
  isActive = true,
}) => {
  const { settings } = useUserSettings();
  const { content, setContent } = useEditorContext();
  const modal = useModal();
  const { setModalContainer } = modal;
  const { showError } = useErrorContext();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fontSize, setFontSize] = useState(settings?.defaultFontZoom || 0); // Default font size in pixels
  const [defineButton, setDefineButton] = useState<{
    x: number;
    y: number;
    word: string;
  } | null>(null);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<ReactQuill | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const findBarSlotRef = useRef<HTMLDivElement | null>(null);
  const imageSelectionRef = useRef<{ index: number; length: number } | null>(
    null,
  );
  const openProjectImageRef = useRef<() => void>(() => undefined);
  const openFootnotesRef = useRef<() => void>(() => undefined);
  const fullscreenTransitionRef = useRef(false);
  const restoreMaximizedAfterFullscreenRef = useRef(false);

  const project = useProjectContext();

  const insertSelectedProjectImage = useCallback((value: ProjectImageValue) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    if (imageSelectionRef.current) {
      editor.setSelection(
        imageSelectionRef.current.index,
        imageSelectionRef.current.length,
        "silent",
      );
    }
    insertProjectImage(editor, value);
  }, []);

  openProjectImageRef.current = () => {
    const editor = quillRef.current?.getEditor();
    imageSelectionRef.current = editor?.getSelection() ?? null;
    modal.renderModal({
      modalSize: "wide",
      modalBody: (
        <ProjectAssetModal
          projectName={project.projectName}
          flushCurrentDocument={project.flushCurrentDocument}
          onInsert={insertSelectedProjectImage}
        />
      ),
    });
  };

  openFootnotesRef.current = () => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const insertionSelection = editor.getSelection(true);
    modal.renderModal({
      modalSize: "wide",
      modalBody: (
        <FootnoteModal
          editor={editor}
          insertionSelection={insertionSelection}
        />
      ),
    });
  };

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
    if (!isActive) return;

    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "s") {
        event.preventDefault();
        handleSave(); // Trigger save on Ctrl+S
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [content, isActive, selectedFile]);

  const toggleFullScreen = useCallback(async () => {
    if (fullscreenTransitionRef.current) return;

    fullscreenTransitionRef.current = true;
    const appWindow = getCurrentWindow();

    try {
      const nextFullScreen = !(await appWindow.isFullscreen());
      if (nextFullScreen) {
        restoreMaximizedAfterFullscreenRef.current =
          await appWindow.isMaximized();

        // Paint the editor-only overlay before Windows expands the native
        // window so the normal application layout cannot flash in between.
        setIsFullScreen(true);
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });
      }

      await invoke("set_editor_fullscreen", {
        fullscreen: nextFullScreen,
        restoreMaximized: restoreMaximizedAfterFullscreenRef.current,
        backgroundColor: getEditorBackgroundRgba(),
      });

      const actualFullScreen = await appWindow.isFullscreen();
      setIsFullScreen(actualFullScreen);

      if (!actualFullScreen) {
        restoreMaximizedAfterFullscreenRef.current = false;
      }

      if (actualFullScreen !== nextFullScreen) {
        throw new Error("Windows did not complete the fullscreen transition.");
      }
    } catch (error) {
      showError(error, "while toggling fullscreen");

      try {
        const actualFullScreen = await appWindow.isFullscreen();
        setIsFullScreen(actualFullScreen);
        if (!actualFullScreen) {
          restoreMaximizedAfterFullscreenRef.current = false;
        }
      } catch (syncError) {
        console.error("Failed to read fullscreen state", syncError);
      }
    } finally {
      fullscreenTransitionRef.current = false;
    }
  }, [showError]);

  useEffect(() => {
    if (!isActive) return;

    const handleFullScreenShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;

      event.preventDefault();
      if (!event.repeat) {
        void toggleFullScreen();
      }
    };

    window.addEventListener("keydown", handleFullScreenShortcut);
    return () => {
      window.removeEventListener("keydown", handleFullScreenShortcut);
    };
  }, [isActive, toggleFullScreen]);

  useEffect(() => {
    const defaultContainer =
      typeof document !== "undefined" ? document.body : null;

    if (isFullScreen && editorRef.current) {
      setModalContainer(editorRef.current);
    } else {
      setModalContainer(defaultContainer);
    }

    return () => {
      setModalContainer(defaultContainer);
    };
  }, [isFullScreen, setModalContainer]);

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
    if (!isActive) return;

    window.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheelZoom);
    };
  }, [fontSize, isActive]);

  const modules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          ["bold", "italic", "underline", "strike"],
          ["blockquote", "link"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["sceneBreak", "projectImage", "footnotes"],
        ],
        handlers: {
          sceneBreak: insertSceneBreak,
          projectImage: () => openProjectImageRef.current(),
          footnotes: () => openFootnotesRef.current(),
        },
      },
      smartTypography: true,
      clipboard: {
        matchers: [
          ["BR", softBreakClipboardMatcher],
          ["HR", sceneBreakClipboardMatcher],
          ["FIGURE", projectImageClipboardMatcher],
          ["SUP", footnoteReferenceClipboardMatcher],
          ["ASIDE", footnoteDefinitionClipboardMatcher],
        ],
      },
      keyboard: {
        bindings: {
          sceneBreak: sceneBreakKeyboardBinding,
          softBreak: {
            key: "Enter",
            shiftKey: true,
            handler: insertSoftBreak,
          },
        },
      },
    };
  }, []);

  useEffect(() => {
    labelQuillToolbar(editorRef.current?.querySelector(".ql-toolbar") ?? null);
  }, []);

  useEffect(() => {
    const quillEditor = editorRef.current?.querySelector(".ql-editor");
    if (quillEditor) {
      (quillEditor as HTMLElement).style.fontSize = `${fontSize}px`;
    }
  }, [fontSize]);

  const handleContentChange = (newContent: string) => {
    if (!isActive) return;
    setContent(newContent); // Save raw content without processing
  };

  // Show a floating "Define" button when the user selects a single word
  // inside the editor. Positioned to the top-right of the selection.
  const dictionaryEnabled = settings?.dictionaryEnabled ?? true;

  useEffect(() => {
    if (!isActive) {
      setDefineButton(null);
      return;
    }

    if (!dictionaryEnabled) {
      setDefineButton(null);
      return;
    }

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setDefineButton(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const container = editorRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setDefineButton(null);
        return;
      }

      const raw = selection.toString().trim();
      const word = normalizeWord(raw);
      // Single word only: reject anything containing internal whitespace.
      if (!word || /\s/.test(raw)) {
        setDefineButton(null);
        return;
      }

      // Whole-word only: reject partial selections (e.g. "et" in "clarinet")
      // by checking the characters adjacent to the selection in the text.
      const editor = quillRef.current?.getEditor();
      const qSel = editor?.getSelection();
      if (
        editor &&
        qSel &&
        qSel.length > 0 &&
        !hasWholeWordBoundaries(editor, qSel)
      ) {
        setDefineButton(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setDefineButton({ x: rect.right, y: rect.top, word });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [dictionaryEnabled, isActive]);

  // Keep the Define button anchored to the word while scrolling; hide it once
  // the selection scrolls out of the editor's visible area.
  useEffect(() => {
    if (!isActive) return;
    if (!defineButton) return;

    const reposition = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setDefineButton(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const containerRect = editorRef.current?.getBoundingClientRect();
      if (
        containerRect &&
        (rect.bottom < containerRect.top || rect.top > containerRect.bottom)
      ) {
        setDefineButton(null);
        return;
      }
      setDefineButton((prev) =>
        prev ? { ...prev, x: rect.right, y: rect.top } : prev,
      );
    };

    // Capture so scrolls from any inner container (e.g. .ql-editor) are caught.
    window.addEventListener("scroll", reposition, true);
    return () => window.removeEventListener("scroll", reposition, true);
  }, [defineButton?.word, isActive]);

  const handleDefine = () => {
    if (!defineButton) return;
    const { word } = defineButton;
    setDefineButton(null);
    modal.renderModal({ modalBody: <DefinitionModal word={word} /> });
  };

  // ── In-file find (Ctrl+F) ──────────────────────────────────────────────────

  const computeMatches = useCallback((term: string): number[] => {
    const editor = quillRef.current?.getEditor();
    if (!editor || !term) return [];
    const text = editor.getText().toLowerCase();
    const needle = term.toLowerCase();
    const found: number[] = [];
    let pos = 0;
    while (pos <= text.length - needle.length) {
      const idx = text.indexOf(needle, pos);
      if (idx === -1) break;
      found.push(idx);
      pos = idx + needle.length; // non-overlapping matches
    }
    return found;
  }, []);

  const goToMatch = useCallback(
    (matches: number[], index: number) => {
      const editor = quillRef.current?.getEditor();
      if (!editor || matches.length === 0) return;
      const wrapped =
        ((index % matches.length) + matches.length) % matches.length;
      // Selecting the match highlights it natively and scrolls it into view.
      editor.setSelection(matches[wrapped], findTerm.length, "user");
      setCurrentMatch(wrapped);
    },
    [findTerm],
  );

  const nextMatch = useCallback(() => {
    goToMatch(findMatches, currentMatch + 1);
  }, [goToMatch, findMatches, currentMatch]);

  const prevMatch = useCallback(() => {
    goToMatch(findMatches, currentMatch - 1);
  }, [goToMatch, findMatches, currentMatch]);

  // Recompute matches whenever the term, editor content, or open state changes.
  // Start at -1 so the first Enter/next lands on the first match (index 0).
  useEffect(() => {
    if (!isFindOpen) return;
    setFindMatches(computeMatches(findTerm));
    setCurrentMatch(-1);
  }, [findTerm, isFindOpen, content, computeMatches]);

  // Open with Ctrl+F, prefilling a single-word selection when present.
  useEffect(() => {
    if (!isActive) return;

    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (isFindOpen) {
          setIsFindOpen(false);
          return;
        }
        const editor = quillRef.current?.getEditor();
        const selection = editor?.getSelection();
        if (selection && selection.length > 0) {
          const selected = editor!
            .getText(selection.index, selection.length)
            .trim();
          if (selected && !/\s/.test(selected)) setFindTerm(selected);
        }
        setIsFindOpen(true);
        setTimeout(() => findInputRef.current?.select(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, isFindOpen]);

  // While open: Enter/Shift+Enter navigate, Escape closes. Global so it works
  // regardless of whether focus is in the find input or the editor.
  useEffect(() => {
    if (!isActive) return;
    if (!isFindOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsFindOpen(false);
        return;
      }
      if (event.key === "Enter") {
        // Capture + stopPropagation so Quill never inserts a newline when the
        // editor has focus after navigating to a previous match.
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) prevMatch();
        else nextMatch();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isActive, isFindOpen, nextMatch, prevMatch]);

  useEffect(() => {
    if (isActive) return;
    setIsFindOpen(false);
    setDefineButton(null);
  }, [isActive]);

  const handleSave = () => {
    if (content) {
      // Create a temporary DOM element to parse the HTML content
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = content;

      // Process only the text nodes to preserve HTML structure
      const processTextNodes = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent = convertToCurlyQuotes(node.textContent || "");
        } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
          node.childNodes.forEach(processTextNodes);
        }
      };

      processTextNodes(tempDiv);

      // Save the processed HTML content
      const processedContent = tempDiv.innerHTML;
      void project.saveFileContent(processedContent).catch(() => {
        // ProjectProvider reports ordinary save failures to the user.
      });
    }
  };

  // Render the find bar into the (non-scrolling) title header row so it lines
  // up with the filename input instead of overlapping the editor's save button.
  const findBarSlot =
    typeof document !== "undefined"
      ? document.getElementById("findbar-slot")
      : null;
  const fullscreenFindBarTarget = findBarSlotRef.current;
  const findBarPortalTarget = isFullScreen
    ? fullscreenFindBarTarget
    : findBarSlot;

  return (
    <div
      ref={editorRef}
      className={`project-text-editor relative h-full ${isFullScreen ? "fullscreen-editor" : ""}`}
    >
      <div
        ref={findBarSlotRef}
        className="absolute top-3 right-5 z-[51]"
        aria-hidden="true"
      />

      {isFindOpen &&
        findBarPortalTarget &&
        createPortal(
          <FindBar
            term={findTerm}
            onTermChange={setFindTerm}
            matchCount={findMatches.length}
            currentIndex={currentMatch}
            onNext={nextMatch}
            onPrev={prevMatch}
            onClose={() => setIsFindOpen(false)}
            inputRef={findInputRef}
          />,
          findBarPortalTarget,
        )}

      {defineButton && (
        <button
          // Prevent mousedown from collapsing the selection before the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleDefine}
          className="fixed rounded shadow-lg px-2 py-1 text-xs font-medium whitespace-nowrap z-[60] hover:opacity-90"
          style={{
            top: defineButton.y,
            left: defineButton.x,
            transform: "translate(4px, -100%)",
            background: "var(--accent-bg, var(--accent))",
            color: "var(--accent-text, var(--btn-text))",
            border: "1px solid var(--border-color)",
          }}
        >
          Define
        </button>
      )}

      <FiSave
        onClick={isActive ? handleSave : undefined}
        className="save-icon absolute top-2 right-7 cursor-pointer text-2xl"
        style={{ color: "var(--accent)" }}
        title="Save"
      />

      <p
        className="italic save-icon absolute top-2 right-20 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Ctrl + wheel to zoom · F11 for fullscreen
      </p>

      <ReactQuill
        ref={quillRef}
        value={content}
        onChange={handleContentChange}
        readOnly={!isActive}
        style={{
          height: `calc(100% - ${isDrawerExpanded ? "3rem" : "3rem"})`,
          fontFamily: "var(--editor-font-family)",
        }}
        modules={modules}
      />
    </div>
  );
};

export default TextEditor;
