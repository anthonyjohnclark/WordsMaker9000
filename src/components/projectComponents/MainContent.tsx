import React from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import Editor from "./Editor";
import NoFileSelectedContent from "./NoFileSelected";

type MainContentProps = {
  isEditorActive?: boolean;
};

const MainContentWithActivity: React.FC<MainContentProps> = ({
  isEditorActive = true,
}) => {
  const project = useProjectContext();

  return (
    <section
      className="relative flex-1"
      style={{ background: "var(--bg-secondary)" }}
    >
      {project.selectedFile ? (
        <Editor isEditorActive={isEditorActive} />
      ) : (
        <NoFileSelectedContent />
      )}
    </section>
  );
};

export default MainContentWithActivity;
