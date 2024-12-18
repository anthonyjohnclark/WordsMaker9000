import { useModal } from "WordsMaker9000/app/contexts/global/ModalContext";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { NodeModel } from "@minoru/react-dnd-treeview";
import Loadable from "WordsMaker9000/app/components/Loadable";
import React, { useState } from "react";
import { useErrorContext } from "WordsMaker9000/app/contexts/global/ErrorContext";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const DeleteConfirmationModal = ({ node }: IProps) => {
  const modal = useModal();
  const project = useProjectContext();

  const [isLoading, setIsLoading] = useState(false);

  const { showError } = useErrorContext();

  const handleDeleteConfirm = async () => {
    setIsLoading(true);
    try {
      // Simulate a delay for the async operation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Perform the delete operation
      await project.handleDelete(
        node.id as number,
        node.data?.fileId,
        node.data?.fileType
      );

      // Close the modal after successful deletion
      modal.handleClose();
    } catch (error) {
      showError(error, "deleting a modal");
      // Optionally handle error (e.g., show a notification)
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Loadable isLoading={isLoading}>
      <>
        <h2 className="text-xl font-bold text-white mb-4">Confirm Deletion</h2>
        <p className="text-white mb-4">
          Are you sure you want to delete{" "}
          <strong className="text-red-500">{node.text}</strong>?
        </p>
        <div className="flex justify-end gap-4 mt-4">
          <button
            onClick={() => modal.handleClose()}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-400"
          >
            Delete
          </button>
        </div>
      </>
    </Loadable>
  );
};
