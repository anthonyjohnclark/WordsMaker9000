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
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          {newNode?.data?.fileType === "file" ? (
            <FiFile className="text-green-500" />
          ) : (
            <FiFolder className="text-blue-500" />
          )}
          {`Enter ${newNode?.data?.fileType} name`}
        </h2>
        <input
          type="text"
          value={newNodeText}
          onChange={(e) => setNewNodeText(e.target.value)}
          autoFocus
          className={`border border-gray-500 bg-gray-700 text-white rounded w-full p-2 mb-4 focus:outline-none focus:ring-2 ${
            newNode?.data?.fileType === "folder"
              ? "focus:ring-blue-500"
              : "focus:ring-green-500"
          }`}
          placeholder={`Enter ${newNode?.data?.fileType} name`}
        />
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              modal.handleClose();
            }}
            className="px-4 py-2 bg-gray-500 text-gray-200 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={newNodeText.length === 0}
            className={`px-4 py-2 text-white rounded hover:${
              newNode?.data?.fileType === "folder"
                ? "bg-blue-400"
                : "bg-green-400"
            } ${
              newNode?.data?.fileType === "folder"
                ? "bg-blue-500"
                : "bg-green-500"
            }`}
          >
            Add
          </button>
        </div>
      </>
    </Loadable>
  );
};
