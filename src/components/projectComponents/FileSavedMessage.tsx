import React from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { FiCheckCircle } from "react-icons/fi";
import Loadable from "../../components/Loadable";

const FileSavedMessage: React.FC = () => {
  const project = useProjectContext();

  return (
    <div className="fixed top-10 right-4 text-white px-4 py-2 rounded flex items-center shadow-lg z-50">
      <Loadable isLoading={project.fileSaveInProgress}>
        {project.fileSavedMessage && (
          <div className="fixed top-10 right-4 bg-green-500 text-white px-4 py-2 rounded flex items-center shadow-lg z-50">
            <FiCheckCircle className="w-5 h-5 mr-2" />
            <span>File saved!</span>
          </div>
        )}
      </Loadable>
    </div>
  );
};

export default FileSavedMessage;
