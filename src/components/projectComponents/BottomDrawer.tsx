import React, { useState, useEffect, useRef } from "react";
import { FiChevronDown, FiChevronUp, FiSlash } from "react-icons/fi"; // Import the clear icon
import { useUserSettings } from "../../contexts/global/UserSettingsContext";
import { useAIContext } from "../../contexts/pages/AIContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { formatDateTime } from "../../utils/helpers";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize"; // For sanitizing the HTML output

type BottomDrawerProps = {
  onStateChange: (isExpanded: boolean, height: number) => void;
};

const BottomDrawer: React.FC<BottomDrawerProps> = ({ onStateChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const {
    handleProofread,
    handleSuggestions,
    handleReview,
    isProcessing,
    content,
    handleAccept,
    declineAllChanges,
    showDiff,
  } = useAIContext();

  const { settings } = useUserSettings();
  const project = useProjectContext();

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const height = entry.contentRect.height;
        onStateChange(isExpanded, height); // Notify parent of height changes
      }
    });

    if (drawerRef.current) {
      observer.observe(drawerRef.current);
    }

    return () => {
      if (drawerRef.current) {
        observer.unobserve(drawerRef.current);
      }
    };
  }, [isExpanded, onStateChange]);

  // Key listener for Ctrl + Up Arrow and Ctrl + Down Arrow
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        settings?.aiSuiteEnabled &&
        !showDiff &&
        !isProcessing
      ) {
        if (event.key === "ArrowUp") {
          event.preventDefault(); // Prevent default browser behavior
          if (!isExpanded) {
            setIsExpanded(true); // Expand the drawer
          }
        } else if (event.key === "ArrowDown") {
          event.preventDefault(); // Prevent default browser behavior
          if (isExpanded) {
            setIsExpanded(false); // Collapse the drawer
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [settings?.aiSuiteEnabled, showDiff, isProcessing, isExpanded]);

  const handleAiAction = async (action: () => Promise<string | undefined>) => {
    setAiResponse(null); // Clear previous response
    try {
      const response = await action();
      setAiResponse(response ?? ""); // Set new AI response
    } catch (err) {
      setAiResponse("An error occurred while processing the AI request.");
    }
  };

  return (
    <div
      ref={drawerRef}
      className={`absolute bottom-0 left-0 right-0 overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? "max-h-[500px]" : "max-h-12"
      }`}
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header Row */}
      <div
        className="flex items-center justify-between p-2 border-t"
        style={{ borderColor: "var(--border-color)" }}
      >
        {settings?.aiSuiteEnabled && (
          <h3 className="text-lg font-semibold">AI Suite</h3>
        )}
        <div className="flex items-center space-x-4">
          <span className="text-sm">
            <span className="font-bold">Created:</span>{" "}
            <span style={{ color: "var(--btn-success)" }}>
              {project?.selectedFile?.data?.createDate &&
                formatDateTime(project.selectedFile.data.createDate)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Last Edited:</span>{" "}
            <span style={{ color: "var(--btn-success)" }}>
              {project?.selectedFile?.data?.lastModified &&
                formatDateTime(project.selectedFile.data.lastModified)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Word Count:</span>{" "}
            <span style={{ color: "var(--btn-primary)" }}>
              {project?.selectedFile?.data?.wordCount}
            </span>
          </span>
          {settings?.aiSuiteEnabled && !showDiff && !isProcessing && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1 rounded focus:outline-none"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4">
          {/* Button Row */}
          <div className="flex justify-between items-center space-x-4 mb-4">
            <div className="flex space-x-4">
              <button
                className={`px-4 py-2 rounded transition ${
                  isProcessing ? "opacity-50 cursor-not-allowed" : ""
                }`}
                style={{
                  background: "var(--btn-primary)",
                  color: "var(--btn-text)",
                }}
                onClick={() => handleProofread(content)}
                disabled={isProcessing}
              >
                Proofreading
              </button>
              <button
                className={`px-4 py-2 rounded transition ${
                  isProcessing || showDiff
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                style={{
                  background: "var(--btn-success)",
                  color: "var(--btn-text)",
                }}
                onClick={() => handleAiAction(() => handleSuggestions(content))}
                disabled={isProcessing || showDiff}
              >
                Suggestions
              </button>
              <button
                className={`px-4 py-2 rounded transition ${
                  isProcessing || showDiff
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                style={{
                  background: "var(--accent-bg)",
                  color: "var(--accent-text)",
                }}
                onClick={() => handleAiAction(() => handleReview(content))}
                disabled={isProcessing || showDiff}
              >
                Review
              </button>
            </div>
            {aiResponse && (
              <button
                className="flex items-center px-4 py-2 rounded transition focus:outline-none"
                style={{
                  background: "var(--btn-danger)",
                  color: "var(--btn-text)",
                }}
                onClick={() => setAiResponse(null)} // Clear the AI response
              >
                <FiSlash />
              </button>
            )}
          </div>

          {/* Additional Content */}
          <div
            className="border-t pt-4"
            style={{ borderColor: "var(--border-color)" }}
          >
            {isProcessing ? (
              <div
                className="font-mono text-sm p-4 rounded"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <pre>
                  <code>Asking the AI...</code>
                </pre>
              </div>
            ) : showDiff ? (
              <div className="flex space-x-2">
                <button
                  onClick={() => handleAccept()}
                  className="px-4 py-2 rounded"
                  style={{
                    background: "var(--btn-success)",
                    color: "var(--btn-text)",
                  }}
                >
                  Accept Changes
                </button>
                <button
                  onClick={() => declineAllChanges()}
                  className={`px-4 py-2 rounded ${
                    isProcessing ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  style={{
                    background: "var(--btn-danger)",
                    color: "var(--btn-text)",
                  }}
                  disabled={isProcessing}
                >
                  Decline All Changes
                </button>
              </div>
            ) : aiResponse ? (
              <div
                className="text-sm p-4 rounded overflow-y-auto max-h-60"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    li: ({ children }) => (
                      <li className="list-disc ml-4 p-2">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ color: "var(--btn-primary)" }}>
                        {children}
                      </strong>
                    ),
                  }}
                >
                  {aiResponse}
                </ReactMarkdown>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default BottomDrawer;
