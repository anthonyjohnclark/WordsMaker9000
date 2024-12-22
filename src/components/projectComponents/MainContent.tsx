" ";

import React from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import Editor from "./Editor";
import NoFileSelectedContent from "./NoFileSelected";

const MainContent: React.FC = () => {
  const project = useProjectContext();

  return (
    <section className={`relative flex-1 bg-black  `}>
      {project.selectedFile ? <Editor /> : <NoFileSelectedContent />}
    </section>
  );
};

export default MainContent;
