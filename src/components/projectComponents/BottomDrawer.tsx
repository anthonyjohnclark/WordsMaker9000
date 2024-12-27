import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { useUserSettings } from "../../contexts/global/UserSettingsContext";
import { useAIContext } from "../../contexts/pages/AIContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { formatDateTime } from "../../utils/helpers";

type BottomDrawerProps = {
  onStateChange: (isExpanded: boolean) => void;
};

const BottomDrawer: React.FC<BottomDrawerProps> = ({ onStateChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    handleProofread,
    // handleSuggestions,
    // handleReview,
    isProcessing,
    content,
    handleAccept,
    declineAllChanges,
    showDiff,
  } = useAIContext();

  const { settings } = useUserSettings();
  const project = useProjectContext();

  useEffect(() => {
    onStateChange(isExpanded);
  }, [isExpanded, onStateChange]);

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gray-800 text-white transition-all duration-300 ${
        isExpanded ? "h-64" : "h-12"
      } overflow-hidden`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between p-2 border-t border-gray-700">
        {settings?.aiSuiteEnabled && (
          <h3 className="text-lg font-semibold">AI Suite</h3>
        )}
        <div className="flex items-center space-x-4">
          <span className="text-sm">
            <span className="font-bold">Created:</span>{" "}
            <span className="text-green-500">
              {project?.selectedFile?.data?.createDate &&
                formatDateTime(project.selectedFile.data.createDate)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Last Edited:</span>{" "}
            <span className="text-green-500">
              {project?.selectedFile?.data?.lastModified &&
                formatDateTime(project.selectedFile.data.lastModified)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Word Count:</span>{" "}
            <span className="text-blue-500">
              {project?.selectedFile?.data?.wordCount}
            </span>
          </span>
          {settings?.aiSuiteEnabled && !showDiff && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-500 focus:outline-none focus:ring focus:ring-blue-500"
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4">
          {/* Button Row */}
          <div className="flex space-x-4 mb-4">
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-400"
              onClick={() => handleProofread(content)}
              disabled={isProcessing}
            >
              Proofreading
            </button>
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-400"
              // onClick={() => handleSuggestions("Your text here")}
              disabled={isProcessing}
            >
              Suggestions
            </button>
            <button
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-400"
              // onClick={() => handleReview("Your text here")}
              disabled={isProcessing}
            >
              Review
            </button>
          </div>

          {/* Additional Content */}
          <div className="border-t border-gray-600 pt-4">
            {isProcessing ? (
              <div className="bg-gray-800 text-gray-400 font-mono text-sm p-4 rounded">
                <pre>
                  <code>Asking the AI to proofread...</code>
                </pre>
              </div>
            ) : showDiff ? (
              <div className="flex space-x-2">
                <button
                  onClick={() => handleAccept()}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-400"
                >
                  Accept Changes
                </button>
                <button
                  onClick={() => declineAllChanges()}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-400"
                  disabled={isProcessing}
                >
                  Decline All Changes
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default BottomDrawer;
