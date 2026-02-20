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
      showError(error, "deleting project");
    }
    modal.handleClose();
  };

  return (
    <Loadable isLoading={deletionLoading}>
      <div
        className="rounded-lg p-6 max-w-sm w-full"
        style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--btn-danger)" }}
        >
          Delete Project
        </h2>
        <p className="mb-4" style={{ color: "var(--text-primary)" }}>
          Type the project name{" "}
          <strong style={{ color: "var(--btn-danger)" }}>
            {decodeURIComponent(projectName)}
          </strong>{" "}
          to confirm deletion:
        </p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Project name"
          className="w-full border rounded p-2 focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
          }}
        />
        <div className="mt-4 flex justify-end space-x-4">
          <button
            onClick={onCancel}
            className="py-2 px-4 rounded transition"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onDeleteConfirm}
            disabled={confirmationText !== decodeURIComponent(projectName)}
            className={`${
              confirmationText !== decodeURIComponent(projectName)
                ? "cursor-not-allowed opacity-50"
                : ""
            } py-2 px-4 rounded transition`}
            style={{
              background: "var(--btn-danger)",
              color: "var(--btn-text)",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </Loadable>
  );
};

export default DeleteProjectConfirmationModal;
