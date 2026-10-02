import React from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { FiCheckCircle } from "react-icons/fi";
import Loadable from "../../components/Loadable";

const FileSavedMessage: React.FC = () => {
  const project = useProjectContext();

  return (
    <div className="fixed top-10 right-10 z-50 flex h-12 items-center justify-center pointer-events-none">
      <Loadable isLoading={project.fileSaveInProgress}>
        {project.fileSavedMessage && (
          <div
            className="px-3 py-2 rounded flex items-center text-sm"
            style={{
              background: "var(--btn-success)",
              color: "var(--btn-text)",
            }}
          >
            <FiCheckCircle className="w-5 h-5 mr-2" />
            <span>File saved!</span>
          </div>
        )}
      </Loadable>
    </div>
  );
};

export default FileSavedMessage;
