import { useModal } from "WordsMaker9000/app/contexts/global/ModalContext";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import React, { useState } from "react";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { NodeModel } from "@minoru/react-dnd-treeview";
import Loadable from "WordsMaker9000/app/components/Loadable";
import { useErrorContext } from "WordsMaker9000/app/contexts/global/ErrorContext";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const RenameModal = ({ node }: IProps) => {
  const modal = useModal();
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { showError } = useErrorContext();

  const project = useProjectContext();

  const handleRenameSubmit = async (
    node: ExtendedNodeModel | NodeModel<NodeData>
  ) => {
    if (newName.trim()) {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        project.handleRename(node.id as number, newName.trim());

        modal.handleClose();
      } catch (error) {
        showError(error, "renaming the file");
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
