import React, { useState } from "react";
import Loadable from "./Loadable";
import { useModal } from "../contexts/global/ModalContext";
import { deleteProject } from "../utils/fileManager";
import { useErrorContext } from "../contexts/global/ErrorContext";

interface DeleteConfirmationModalProps {
  projectName: string;
  onCancel?: () => void;
  handleSetNewProjects: (deletedProject: string) => void;
}

const DeleteProjectConfirmationModal: React.FC<
  DeleteConfirmationModalProps
> = ({ projectName, onCancel, handleSetNewProjects }) => {
  const [confirmationText, setConfirmationText] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);

  const modal = useModal();

  const { showError } = useErrorContext();

  const onDeleteConfirm = async () => {
    setDeletionLoading(true);
    try {
      await deleteProject(projectName);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      handleSetNewProjects(projectName);
    } catch (error) {
      showError(error, "deleting file");
    }
    modal.handleClose();
  };

  return (
    <Loadable isLoading={deletionLoading}>
      <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4 text-red-500">Delete Project</h2>
        <p className="mb-4 text-white">
          Type the project name{" "}
          <strong>{decodeURIComponent(projectName)}</strong> to confirm
          deletion:
        </p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Project name"
          className="w-full border border-gray-700 bg-gray-900 text-white rounded p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
        />
        <div className="mt-4 flex justify-end space-x-4">
          <button
            onClick={onCancel}
            className="bg-gray-700 text-white py-2 px-4 rounded hover:bg-gray-600 transition"
          >
            Cancel
          </button>
          <button
            onClick={onDeleteConfirm}
            disabled={confirmationText !== decodeURIComponent(projectName)}
            className={`${
              confirmationText === decodeURIComponent(projectName)
                ? "bg-red-500 hover:bg-red-400"
                : "bg-gray-600 cursor-not-allowed"
            } text-white py-2 px-4 rounded transition`}
          >
            Delete
          </button>
        </div>
      </div>
    </Loadable>
  );
};

export default DeleteProjectConfirmationModal;
