"use client";

import React from "react";
import { useProjectContext } from "gilgamesh/app/contexts/pages/ProjectProvider";
import SelectedFileContent from "./SelectedFileContent";
import NoFileSelectedContent from "./NoFileSelected";

const MainContent: React.FC = () => {
  const project = useProjectContext();

  return (
    <section
      className={`flex-1 bg-black pl-5 pr-5 ${
        project.isSidebarOpen ? "ml-0" : "ml-12"
      }`}
    >
      {project.selectedFile ? (
        <SelectedFileContent />
      ) : (
        <NoFileSelectedContent />
      )}
    </section>
  );
};

export default MainContent;
