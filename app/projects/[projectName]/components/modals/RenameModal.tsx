import { useModal } from "WordsMaker9000/app/contexts/global/ModalContext";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import React, { useState } from "react";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { NodeModel } from "@minoru/react-dnd-treeview";
import Loadable from "WordsMaker9000/app/components/Loadable";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const RenameModal = ({ node }: IProps) => {
  const modal = useModal();
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const project = useProjectContext();

  const handleRenameSubmit = async (
    node: ExtendedNodeModel | NodeModel<NodeData>
  ) => {
    if (newName.trim()) {
      setIsLoading(true);
      try {
        // Simulate a delay for the async operation
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Perform the rename operation
        project.handleRename(node.id as number, newName.trim());

        // Close the modal after successful rename
        modal.handleClose();
      } catch (error) {
        console.error("Failed to rename:", error);
        // Optionally handle error (e.g., show a notification)
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Loadable isLoading={isLoading}>
      <>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          Rename Folder
        </h2>
        <input
          type="text"
          value={newName}
          placeholder={node.text}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full p-3 border border-gray-500 rounded bg-gray-700 text-white text-lg focus:outline-none focus:ring focus:ring-yellow-500"
          autoFocus
        />
        <div className="flex justify-end gap-4 mt-4">
          <button
            onClick={() => modal.handleClose()}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={() => handleRenameSubmit(node)}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-400"
          >
            Save
          </button>
        </div>
      </>
    </Loadable>
  );
};
