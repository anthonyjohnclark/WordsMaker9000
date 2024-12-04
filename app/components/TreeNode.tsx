import React, { useState } from "react";
import { FiFilePlus, FiFolderPlus, FiTrash2, FiEdit } from "react-icons/fi";
import {
  ExtendedNodeModel,
  NodeData,
} from "../projects/[projectName]/ProjectPageClient";
import { NodeModel } from "@minoru/react-dnd-treeview";

type TreeNodeProps = {
  node: NodeModel<NodeData> | ExtendedNodeModel;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
  selectedFile: ExtendedNodeModel | null;
  setSelectedFile: (node: ExtendedNodeModel) => void;
  loadFileContent: (node: ExtendedNodeModel) => void;
  handleDelete: (
    id: number,
    fileId: string | undefined,
    type: "file" | "folder" | undefined
  ) => Promise<void>;
  handleRename: (id: number, newName: string) => void;
  handleSubmit: (newNode: ExtendedNodeModel) => Promise<void>;
};

const TreeNode = ({
  node,
  depth,
  isOpen,
  onToggle,
  selectedFile,
  setSelectedFile,
  loadFileContent,
  handleDelete,
  handleRename,
  handleSubmit,
}: TreeNodeProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.text);

  const handleRenameSubmit = () => {
    if (newName.trim()) {
      handleRename(node.id as number, newName.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div
      style={{
        marginLeft: depth * 20,
        backgroundColor:
          selectedFile?.id === node.id
            ? "rgba(59, 130, 246, 0.2)"
            : "transparent",
      }}
      className="p-2 cursor-pointer flex items-center gap-2 group"
    >
      <span
        onClick={() => {
          if (node.data?.fileType === "folder") {
            onToggle();
          } else {
            setSelectedFile(node as ExtendedNodeModel);
            loadFileContent(node as ExtendedNodeModel);
          }
        }}
      >
        {node.data?.fileType === "folder"
          ? isOpen
            ? "📂 " + node.text
            : "📁 " + node.text
          : "📄 " + node.text}
      </span>
      <div className="flex items-center gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
        {node.data?.fileType === "folder" && (
          <>
            <FiFilePlus
              onClick={() => {
                if (!isOpen) {
                  onToggle();
                }
                handleSubmit({
                  id: 0,
                  text: node.text,
                  parent: node.id as number,
                  droppable: node.droppable,
                  data: {
                    fileId: "",
                    fileName: "",
                    fileType: "file",
                  },
                });
              }}
              className="text-green-500 cursor-pointer hover:text-green-300"
              title="Add File"
            />
            <FiFolderPlus
              onClick={() => {
                if (!isOpen) {
                  onToggle();
                }
                handleSubmit({
                  id: 0,
                  text: node.text,
                  parent: node.id as number,
                  droppable: node.droppable,
                  data: {
                    fileId: "",
                    fileName: "",
                    fileType: "folder",
                  },
                });
              }}
              className="text-blue-500 cursor-pointer hover:text-blue-300"
              title="Add Folder"
            />
            <FiEdit
              onClick={() => setIsRenaming(true)}
              className="text-yellow-500 cursor-pointer hover:text-yellow-300"
              title="Rename"
            />
          </>
        )}
        <FiTrash2
          onClick={() =>
            handleDelete(
              node.id as number,
              node.data?.fileId,
              node.data?.fileType
            )
          }
          className="text-red-500 cursor-pointer hover:text-red-300"
          title="Delete"
        />
      </div>

      {/* Rename Modal */}
      {isRenaming && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-96">
            <h2 className="text-xl font-bold text-white mb-4">Rename Folder</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-3 border border-gray-600 rounded bg-gray-700 text-white text-lg focus:outline-none focus:ring focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={() => setIsRenaming(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeNode;
