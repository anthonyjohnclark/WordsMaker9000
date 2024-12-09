import { useModal } from "WordsMaker9000/app/contexts/global/ModalContext";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";
import React, { useState } from "react";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { NodeModel } from "@minoru/react-dnd-treeview";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const RenameModal = ({ node }: IProps) => {
  const modal = useModal();
  const [newName, setNewName] = useState("");

  const project = useProjectContext();

  const handleRenameSubmit = (
    node: ExtendedNodeModel | NodeModel<NodeData>
  ) => {
    if (newName.trim()) {
      project.handleRename(node.id as number, newName.trim());
    }
  };

  return (
    <>
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        Rename Folder
      </h2>
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white text-lg focus:outline-none focus:ring focus:ring-yellow-500"
        autoFocus
      />
      <div className="flex justify-end gap-4 mt-4">
        <button
          onClick={() => modal.handleClose()}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            handleRenameSubmit(node);
            modal.handleClose();
          }}
          className="px-4 py-2 bg-yellow-500 text-white rounded"
        >
          Save
        </button>
      </div>
    </>
  );
};
