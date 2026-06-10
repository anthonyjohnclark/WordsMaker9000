import React, { useState } from "react";
import Loadable from "./Loadable";
import { useModal } from "../contexts/global/ModalContext";
import { updateMetadata, ProjectType } from "../utils/fileManager";
import { useErrorContext } from "../contexts/global/ErrorContext";

interface EditProjectTypeModalProps {
  projectName: string;
  currentType: ProjectType | "";
  onSuccess: (newType: ProjectType) => void;
}

const EditProjectTypeModal: React.FC<EditProjectTypeModalProps> = ({
  projectName,
  currentType,
  onSuccess,
}) => {
  const [selectedType, setSelectedType] = useState<ProjectType | "">(currentType);
  const [loading, setLoading] = useState(false);
  const modal = useModal();
  const { showError } = useErrorContext();

  const projectTypes: ProjectType[] = [
    "novel",
    "collection",
    "serial",
    "novella",
  ];

  const onSave = async () => {
    if (!selectedType) return;
    setLoading(true);
    try {
      await updateMetadata(projectName, { projectType: selectedType });
      // Small artificial delay to match user expectation and loading UI feel
      await new Promise((resolve) => setTimeout(resolve, 500));
      onSuccess(selectedType);
      modal.handleClose();
    } catch (error) {
      showError(error, "updating project type");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Loadable isLoading={loading}>
      <div
        className="rounded-lg p-6 max-w-sm w-full"
        style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
      >
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: "var(--btn-primary)" }}
        >
          Edit Project Type
        </h2>
        <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          Change the project type for{" "}
          <strong style={{ color: "var(--text-primary)" }}>
            {decodeURIComponent(projectName)}
          </strong>
        </p>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as ProjectType)}
          className="w-full border rounded p-2 focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
          }}
        >
          <option value="" disabled>
            Select a project type
          </option>
          {projectTypes.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>

        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={modal.handleClose}
            className="py-2 px-4 rounded transition"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!selectedType || selectedType === currentType}
            className={`py-2 px-4 rounded transition ${
              !selectedType || selectedType === currentType
                ? "cursor-not-allowed opacity-50"
                : ""
            }`}
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Loadable>
  );
};

export default EditProjectTypeModal;
