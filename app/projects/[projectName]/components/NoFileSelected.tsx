"use client";

import React from "react";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";

const NoFileSelectedContent: React.FC = () => {
  const project = useProjectContext();

  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center max-w-md bg-gray-800 text-white rounded-lg shadow-lg p-8 relative ">
        {/* Project Name */}
        <h1 className="text-2xl font-bold mb-6 text-yellow-500">
          {decodeURIComponent(project.projectName)}
        </h1>

        {/* Arrow to Sidebar */}
        <div className="absolute left-[-80px] top-1/2 transform -translate-y-1/2 flex items-center">
          <div className="flex flex-col items-center">
            <div className="bg-gray-700 p-2 rounded-full">
              <svg
                className="w-6 h-6 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Jumbotron Message */}
        <p className="text-lg text-gray-300 mb-6">
          Select a file from the sidebar or create one to start editing.
        </p>
      </div>
    </div>
  );
};

export default NoFileSelectedContent;
