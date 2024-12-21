"use client";

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

type DiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
  accepted?: boolean; // Tracks whether the user has accepted the change
};

// Define types for AI Context state
type AIContextType = {
  isProcessing: boolean;
  proofreadContent: string;
  handleProofread: (content: string | null) => Promise<void>;
  handleSuggestions: (content: string) => Promise<void>;
  handleReview: (content: string) => Promise<void>;
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
  const { fileContent, saveFileContent } = useProjectContext();

  const { showError } = useErrorContext();

  const { settings } = useUserSettings();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [proofreadContent, setProofreadContent] = useState("");
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState(""); // Track last saved content
  const [mergedContent, setMergedContent] = useState(content);

  const [diff, setDiff] = useState<DiffPart[]>([]);

  console.log("MergedContent:", mergedContent);

  console.log("Diff:", diff);

  console.log(content);

  useEffect(() => {
    setContent(fileContent ?? "");
  }, [fileContent]);

  const handleAccept = () => {
    if (mergedContent.trim() === "") {
      console.warn("Merged content is empty. Retaining original content.");
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
    setContent(fileContent || ""); // Reset content to the original
    setMergedContent(""); // Clear merged content
    setDiff([]); // Clear the diff
    setShowDiff(false); // Hide the diff view
  };

  const handleSave = useCallback(() => {
    console.log("Hey  I should save this:", content);
    saveFileContent(content);
    setLastSavedContent(content);
  }, [content, saveFileContent]);

  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Hey should we save?:", content !== lastSavedContent);

      console.log("HEre is the content:", content);

      console.log("HEre is the lastSavedContent:", lastSavedContent);

      if (content !== lastSavedContent) {
        handleSave();
      }
    }, settings?.defaultSaveInterval ?? 60000);

    return () => clearInterval(interval);
  }, [content, handleSave, lastSavedContent, settings?.defaultSaveInterval]);

  const handleProofread = async (content: string | null) => {
    console.log("this is what is passed to the AI:", content);
    setIsProcessing(true);
    try {
      const response = await fetch("/api/proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      if (response.ok && data.proofreadContent) {
        console.log(data.proofreadContent);
        const plainText = data.proofreadContent;
        setProofreadContent(plainText.replace(/<p>&nbsp;<\/p>/g, "<br>"));
        computeDiff(content || "", plainText);
        setShowDiff(true); // Show the diff view
      }
    } catch (err) {
      showError(err, "retrieving proofread version from OpenAI");
    } finally {
      setIsProcessing(false);
    }
  };

  // Placeholder for suggestions
  const handleSuggestions = async (content: string) => {
    setIsProcessing(true);
    try {
      // Similar to handleProofread but for suggestions
    } catch (err) {
      console.error("Error during suggestions:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const processDiff = (diff) => {
    let lastRemovedIndex = null;

    return diff.map((part, index) => {
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

  // Placeholder for review
  const handleReview = async (content: string) => {
    setIsProcessing(true);
    try {
      // Similar to handleProofread but for review
    } catch (err) {
      console.error("Error during review:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const computeDiff = (original, updated) => {
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
    // const merged = diff
    //   .filter((part) => part.accepted)
    //   .map((part) => part.value)
    //   .join("");
    setContent(mergedContent); // Persist the merged content to the editor
    setShowDiff(false); // Hide the diff view
  };

  // Reject all changes
  const rejectDiff = () => {
    setDiff([]); // Clear the diff without applying changes
  };

  return (
    <AIContext.Provider
      value={{
        setDiff,
        declineAllChanges,
        mergedContent,
        setMergedContent,
        handleAccept,
        content,
        setContent,
        isProcessing,
        proofreadContent,
        diff,
        handleProofread,
        computeDiff,
        acceptDiff,
        rejectDiff,
        handleSuggestions,
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
