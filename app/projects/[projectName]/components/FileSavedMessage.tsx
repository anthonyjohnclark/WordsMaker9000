"use client";

import React from "react";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import { FiCheckCircle } from "react-icons/fi";

const FileSavedMessage: React.FC = () => {
  const project = useProjectContext();

  if (!project.fileSavedMessage) return null;

  return (
    <div className="fixed top-10 right-4 bg-green-500 text-white px-4 py-2 rounded flex items-center shadow-lg z-50">
      <FiCheckCircle className="w-5 h-5 mr-2" />
      <span>File saved!</span>
    </div>
  );
};

export default FileSavedMessage;
