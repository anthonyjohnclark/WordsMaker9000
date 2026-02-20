import { useState } from "react";
import { FiFile, FiFolder } from "react-icons/fi";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { ExtendedNodeModel } from "../../../types/ProjectPageTypes";
import { useModal } from "../../../contexts/global/ModalContext";
import Loadable from "../../../components/Loadable";
import { useErrorContext } from "../../../contexts/global/ErrorContext";

interface IProps {
  newNode: ExtendedNodeModel;
}

export const AddFileFolderModal = ({ newNode }: IProps) => {
  const project = useProjectContext();
  const modal = useModal();

  const { showError } = useErrorContext();

  const [newNodeText, setNewNodeText] = useState<string>(newNode.text);
  const [isLoading, setIsLoading] = useState(false);

  const handleAdd = async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Submit the new node to the project context
      await project.handleSubmit({ ...newNode, text: newNodeText || "" });

      // Close the modal after successful submission
      modal.handleClose();
    } catch (error) {
      showError(error, "adding a folder or file");
      // Optionally handle error, e.g., show a notification
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Loadable isLoading={isLoading}>
      <>
        <h2
          className="text-lg font-bold mb-4 flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          {newNode?.data?.fileType === "file" ? (
            <FiFile style={{ color: "var(--btn-success)" }} />
          ) : (
            <FiFolder style={{ color: "var(--btn-primary)" }} />
          )}
          {`Enter ${newNode?.data?.fileType} name`}
        </h2>
        <input
          type="text"
          value={newNodeText}
          onChange={(e) => setNewNodeText(e.target.value)}
          autoFocus
          className="border rounded w-full p-2 mb-4 focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          placeholder={`Enter ${newNode?.data?.fileType} name`}
        />
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              modal.handleClose();
            }}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={newNodeText.length === 0}
            className="px-4 py-2 rounded"
            style={{
              background:
                newNode?.data?.fileType === "folder"
                  ? "var(--btn-primary)"
                  : "var(--btn-success)",
              color: "var(--btn-text)",
            }}
          >
            Add
          </button>
        </div>
      </>
    </Loadable>
  );
};
