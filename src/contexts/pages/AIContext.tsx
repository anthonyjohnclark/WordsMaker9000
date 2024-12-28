import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { diffWords } from "diff";
import { useProjectContext } from "./ProjectProvider";
import { useUserSettings } from "../global/UserSettingsContext";
import { useErrorContext } from "../global/ErrorContext";
import {
  aiGetReview,
  aiGetSuggestions,
  aiProofreadContent,
} from "../../agents/aiAgent";

export type DiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
  accepted?: boolean; // Tracks whether the user has accepted the change
  linkedToIndex?: number | null;
  unclickable?: boolean;
  lastRemovedIndex?: number;
};

// Define types for AI Context state
type AIContextType = {
  isProcessing: boolean;
  proofreadContent: string;
  handleProofread: (content: string) => void;
  handleSuggestions: (content: string) => Promise<string | undefined>;
  handleReview: (content: string) => Promise<string | undefined>;
  diff: DiffPart[];
  computeDiff: (original: string, updated: string) => void;
  acceptDiff: () => void;
  rejectDiff: () => void;
  showDiff: boolean;
  setShowDiff: React.Dispatch<React.SetStateAction<boolean>>;
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  handleAccept: () => void;
  mergedContent: string;
  setMergedContent: React.Dispatch<React.SetStateAction<string>>;
  declineAllChanges: () => void;
  setDiff: React.Dispatch<React.SetStateAction<DiffPart[]>>;
};

// Default values for the context
const AIContext = createContext<AIContextType | undefined>(undefined);

// AI Provider component
export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { fileContent, saveFileContent, loadFileContent } = useProjectContext();

  const { showError } = useErrorContext();

  const { settings } = useUserSettings();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const [proofreadContent, setProofreadContent] = useState("");

  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [mergedContent, setMergedContent] = useState(content);

  const [diff, setDiff] = useState<DiffPart[]>([]);

  useEffect(() => {
    setContent(fileContent ?? "");
  }, [fileContent]);

  useEffect(() => {
    setShowDiff(false); // Hide the diff view when the content changes
  }, [loadFileContent]);

  const handleAccept = () => {
    if (mergedContent.trim() === "") {
      setContent(content); // Retain original content if merged is empty
    } else {
      setContent(mergedContent); // Apply the updated content
    }
    setDiff([]); // Clear the diff
    setShowDiff(false); // Hide the diff view
    saveFileContent(mergedContent);
  };

  const declineAllChanges = () => {
    // Reset to the original content
    setContent(fileContent || "");
    setMergedContent("");
    setDiff([]);
    setShowDiff(false);
  };

  const handleSave = useCallback(() => {
    saveFileContent(content);
    setLastSavedContent(content);
  }, [content, saveFileContent]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (content !== lastSavedContent) {
        console.log("Auto-saving content...", showDiff);
        handleSave();
      }
    }, settings?.defaultSaveInterval ?? 60000);

    return () => clearInterval(interval);
  }, [content, handleSave, lastSavedContent, settings?.defaultSaveInterval]);

  const handleProofread = async (content: string) => {
    if (!content) return;

    setIsProcessing(true);

    try {
      const proofreadResult = await aiProofreadContent(content);

      console.log("Proofread result:", proofreadResult);

      if (proofreadResult) {
        const plainText = proofreadResult;
        setProofreadContent(plainText.replace(/<p>&nbsp;<\/p>/g, "<br>"));
        computeDiff(content, plainText);
        setShowDiff(true); // Show the diff view
      }
    } catch (err) {
      showError(err, "Retrieving proofread version from OpenAI");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuggestions = async (content: string) => {
    if (!content) return;

    setIsProcessing(true);

    try {
      const suggestions = await aiGetSuggestions(content);
      return suggestions ?? "";
    } catch (err) {
      showError(err, "Retrieving suggestions from OpenAI");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReview = async (content: string) => {
    if (!content) return;

    setIsProcessing(true);

    try {
      const reviewFeedback = await aiGetReview(content);
      return reviewFeedback ?? "";
    } catch (err) {
      showError(err, "Retrieving review feedback from OpenAI");
    } finally {
      setIsProcessing(false);
    }
  };

  const processDiff = (diff: DiffPart[]) => {
    let lastRemovedIndex: number | null = null;

    return diff.map((part: DiffPart, index: number) => {
      if (part.removed) {
        lastRemovedIndex = index; // Track the index of the last removed part
        return { ...part, linkedToIndex: null }; // Initialize with no link
      }

      if (part.added && lastRemovedIndex !== null) {
        // Create references between the current added part and the last removed part
        const updatedRemovedPart = {
          ...diff[lastRemovedIndex],
          linkedToIndex: index, // Point to the current added part
        };

        const updatedAddedPart = {
          ...part,
          linkedToIndex: lastRemovedIndex, // Point to the previous removed part
        };

        // Replace the removed part in the resulting array with its updated version
        diff[lastRemovedIndex] = updatedRemovedPart;

        // Clear the last removed index since it's now linked
        lastRemovedIndex = null;

        return updatedAddedPart;
      }

      return { ...part, linkedToIndex: null }; // Unmodified parts
    });
  };

  const computeDiff = (original: string, updated: string) => {
    const rawDiff = diffWords(original, updated, {
      ignoreWhitespace: false,
    }).map((part) => ({
      ...part,
      accepted: part.removed ? false : part.added ? true : true,
      unclickable: (!part.added && !part.removed) || part.removed, // Mark unchanged parts
    }));
    const processedDiff = processDiff(rawDiff);
    setDiff(processedDiff);
  };
  // Accept all changes
  const acceptDiff = () => {
    setContent(mergedContent);
    setShowDiff(false);
  };

  // Reject all changes
  const rejectDiff = () => {
    setDiff([]); // Clear the diff without applying changes
  };

  return (
    <AIContext.Provider
      value={{
        setDiff,
        handleProofread,
        handleSuggestions,
        declineAllChanges,
        mergedContent,
        setMergedContent,
        handleAccept,
        content,
        setContent,
        isProcessing,
        proofreadContent,
        diff,
        computeDiff,
        acceptDiff,
        rejectDiff,
        handleReview,
        showDiff,
        setShowDiff,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};

// Hook for using the AI Context
export const useAIContext = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAIContext must be used within an AIProvider");
  }
  return context;
};
