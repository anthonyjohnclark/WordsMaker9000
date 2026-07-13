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

// Editor Provider component
export const EditorProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { fileContent, saveFileContent, editorContentRef } =
    useProjectContext();

  const { settings } = useUserSettings();

  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");

  useEffect(() => {
    setContent(fileContent ?? "");
  }, [fileContent]);

  useEffect(() => {
    editorContentRef.current = content;
  }, [content, editorContentRef]);

  const handleSave = useCallback(() => {
    saveFileContent(content);
    setLastSavedContent(content);
  }, [content, saveFileContent]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (content !== lastSavedContent) {
        console.log("Auto-saving content...");
        handleSave();
      }
    }, settings?.defaultSaveInterval ?? 60000);

    return () => clearInterval(interval);
  }, [content, handleSave, lastSavedContent, settings?.defaultSaveInterval]);

  return (
    <EditorContext.Provider
      value={{
        content,
        setContent,
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
