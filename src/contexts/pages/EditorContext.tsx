import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { useProjectContext } from "./ProjectProvider";
import { useUserSettings } from "../global/UserSettingsContext";

// Define types for Editor Context state
type EditorContextType = {
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
};

// Default values for the context
const EditorContext = createContext<EditorContextType | undefined>(undefined);

type EditorProviderProps = {
  children: ReactNode;
  isActive?: boolean;
};

// Editor Provider component
export const EditorProvider: React.FC<EditorProviderProps> = ({
  children,
  isActive = true,
}) => {
  const { fileContent, saveFileContent, editorContentRef } =
    useProjectContext();

  const { settings } = useUserSettings();

  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");

  const setContentAndBuffer: React.Dispatch<React.SetStateAction<string>> =
    useCallback(
      (value) => {
        setContent((previous) => {
          const next =
            typeof value === "function"
              ? (value as (current: string) => string)(previous)
              : value;
          editorContentRef.current = next;
          return next;
        });
      },
      [editorContentRef],
    );

  useEffect(() => {
    const next = fileContent ?? "";
    setContent(next);
    editorContentRef.current = next;
  }, [fileContent]);

  useEffect(() => {
    editorContentRef.current = content;
  }, [content, editorContentRef]);

  const handleSave = useCallback(async () => {
    try {
      await saveFileContent(content);
      setLastSavedContent(content);
    } catch {
      // ProjectProvider reports ordinary save failures to the user.
    }
  }, [content, saveFileContent]);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      if (content !== lastSavedContent) {
        console.log("Auto-saving content...");
        void handleSave();
      }
    }, settings?.defaultSaveInterval ?? 60000);

    return () => clearInterval(interval);
  }, [
    content,
    handleSave,
    isActive,
    lastSavedContent,
    settings?.defaultSaveInterval,
  ]);

  return (
    <EditorContext.Provider
      value={{
        content,
        setContent: setContentAndBuffer,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

// Hook for using the Editor Context
export const useEditorContext = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
};
