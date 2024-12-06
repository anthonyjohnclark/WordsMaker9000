"use client";

import React from "react";
import { useProjectContext } from "gilgamesh/app/contexts/pages/ProjectProvider";
import TextEditor from "gilgamesh/app/projects/[projectName]/components/TextEditor";

const SelectedFileContent: React.FC = () => {
  const project = useProjectContext();

  return (
    <>
      <div className="mb-0 flex items-center justify-between border-b pb-2 pt-2">
        <input
          type="text"
          value={project.selectedFile?.text || ""}
          onChange={(e) => project.handleFileNameChange(e.target.value)} // Use the context handler
          className="w-full text-2xl font-semibold text-white bg-black p-2 rounded focus:outline-none focus:ring focus:ring-blue-500"
        />
      </div>
      <TextEditor
        initialContent={project.fileContent || ""}
        onSave={project.saveFileContent}
        selectedFile={project.selectedFile}
      />
    </>
  );
};

export default SelectedFileContent;
