import React, { useState } from "react";
import { FiFile, FiFolder } from "react-icons/fi";
import { useProjectContext } from "gilgamesh/app/contexts/pages/ProjectProvider";
import { ExtendedNodeModel } from "../../types/ProjectPageTypes";
import { useModal } from "gilgamesh/app/contexts/global/ModalContext";

interface IProps {
  newNode: ExtendedNodeModel;
}

export const AddFileFolderModal = ({ newNode }: IProps) => {
  const project = useProjectContext();
  const modal = useModal();

  const [newNodeText, setNewNodeText] = useState<string>(newNode.text);

  return (
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
        className={`border border-gray-600 bg-gray-700 text-white rounded w-full p-2 mb-4 focus:outline-none focus:ring-2 ${
          newNode?.data?.fileType === "folder"
            ? "focus:ring-blue-500"
            : "focus:ring-green-600"
        }`}
        placeholder={`Enter ${newNode?.data?.fileType} name`}
      />
      <div className="flex justify-end gap-4">
        <button
          onClick={() => {
            modal.handleClose();
          }}
          className="px-4 py-2 bg-gray-600 text-gray-200 rounded hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            project.handleSubmit({ ...newNode, text: newNodeText || "" });
            modal.handleClose();
          }}
          className={`px-4 py-2 text-white rounded hover:${
            newNode?.data?.fileType === "folder"
              ? "bg-blue-400"
              : "bg-green-500"
          } ${
            newNode?.data?.fileType === "folder"
              ? "bg-blue-500"
              : "bg-green-600"
          }`}
        >
          Add
        </button>
      </div>
    </>
  );
};
