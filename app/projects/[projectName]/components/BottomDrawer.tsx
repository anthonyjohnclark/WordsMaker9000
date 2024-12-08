"use client";

import React, { useState, useEffect } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";

type BottomDrawerProps = {
  onStateChange: (isExpanded: boolean) => void;
};

const BottomDrawer: React.FC<BottomDrawerProps> = ({ onStateChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    onStateChange(isExpanded);
  }, [isExpanded, onStateChange]);

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gray-800 text-white transition-all duration-300 ${
        isExpanded ? "h-48" : "h-12"
      } overflow-hidden`}
    >
      {/* Common Top Section (Last Edited, Word Count, and Toggle Button) */}
      <div className="flex items-center justify-between p-2 border-t border-gray-700 relative">
        {/* Left: Last Edited & Word Count */}
        <div className="flex items-center space-x-4">
          <span className="text-sm">
            <span className="font-bold">Last Edited:</span> Placeholder
          </span>
          <span className="text-sm">
            <span className="font-bold">Word Count:</span> Placeholder
          </span>
        </div>

        {/* Right: Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 focus:outline-none focus:ring focus:ring-blue-500 absolute top-2 right-2"
        >
          {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
        </button>
      </div>

      {/* Expanded State Content */}
      {isExpanded && (
        <div className="relative h-full pt-10">
          {" "}
          {/* Add padding to avoid overlap */}
          {/* Top-Left: AI Suite */}
          <div className="absolute top-2 left-2">
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
        </div>
      )}
    </div>
  );
};

export default BottomDrawer;
