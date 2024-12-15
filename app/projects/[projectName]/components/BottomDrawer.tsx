"use client";

import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { useUserSettings } from "WordsMaker9000/app/contexts/global/UserSettingsContext";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import { formatDateTime } from "WordsMaker9000/app/utils/helpers";

type BottomDrawerProps = {
  onStateChange: (isExpanded: boolean) => void;
};

const BottomDrawer: React.FC<BottomDrawerProps> = ({ onStateChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { settings } = useUserSettings();

  const project = useProjectContext();
  useEffect(() => {
    onStateChange(isExpanded);
  }, [isExpanded, onStateChange]);

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gray-800 text-white transition-all duration-300 ${
        isExpanded ? "h-48" : "h-12"
      } overflow-hidden`}
    >
      {/* Top Section (Last Edited, Word Count, and Toggle Button) */}
      <div className="flex items-center justify-between p-2 border-t border-gray-700 relative h-12">
        {/* Left: AI Suite (Visible only when expanded) */}
        {isExpanded && settings?.aiSuiteEnabled && (
          <div className="absolute left-2 top-3/4 transform -translate-y-1/2 pt-5 z-50">
            <h3 className="text-lg font-semibold mb-2">AI Suite</h3>
            <div className="flex space-x-4">
              <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-400">
                Proofreading
              </button>
              <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-400">
                Suggestions
              </button>
              <button className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-400">
                Review
              </button>
            </div>
          </div>
        )}

        {/* Right: Last Edited, Word Count, and Toggle Button */}
        <div className="ml-auto flex items-center space-x-4">
          {/* Last Edited & Word Count */}
          {/* Right: Created, Last Edited, Word Count, and Toggle Button */}
          <div className="ml-auto flex items-center space-x-4">
            {/* Created, Last Edited & Word Count */}
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
                  {project.selectedFile?.data?.wordCount}
                </span>
              </span>
            </div>
          </div>

          {/* Toggle Button */}
          {settings?.aiSuiteEnabled && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-500 focus:outline-none focus:ring focus:ring-blue-500"
            >
              {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded State Content */}
      {isExpanded && (
        <div className="relative h-full pt-14">
          {/* Space for expanded content */}
        </div>
      )}
    </div>
  );
};

export default BottomDrawer;
