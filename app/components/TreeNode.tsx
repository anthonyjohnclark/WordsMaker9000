import React from "react";
import { FiFilePlus, FiFolderPlus, FiTrash2 } from "react-icons/fi";
import { ExtendedNodeModel } from "../projects/[projectName]/ProjectPageClient";

type TreeNodeProps = {
  node: ExtendedNodeModel;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
  selectedFile: ExtendedNodeModel | null;
  toggleFolderState: (id: string, isOpen: boolean) => void;
  setSelectedFile: (node: ExtendedNodeModel) => void;
  loadFileContent: (node: ExtendedNodeModel) => void;
  handleAddItem: (parentId: string | null, type: "file" | "folder") => void;
  handleDeleteItem: (nodeId: string) => void;
  onDelete: (id: any) => void;
  handleSubmit: (newNode: any) => void;
};

// Use forwardRef to ensure drag-and-drop props are handled properly
const TreeNode = ({
  node,
  depth,
  isOpen,
  onToggle,
  selectedFile,
  toggleFolderState,
  setSelectedFile,
  loadFileContent,
  handleAddItem,
  handleDeleteItem,
  onDelete,
  handleSubmit,
  ...dragAndDropProps // Spread drag-and-drop props
}: TreeNodeProps) => {
  return (
    <div
      style={{
        ...dragAndDropProps.style, // Ensure drag-and-drop style is applied
        marginLeft: depth * 20,
        backgroundColor:
          selectedFile?.id === node.id
            ? "rgba(59, 130, 246, 0.2)"
            : "transparent",
      }}
      className="p-2 cursor-pointer flex items-center gap-2"
    >
      <span
        onClick={() => {
          if (node.type === "folder") {
            onToggle();
          } else {
            setSelectedFile(node);
            loadFileContent(node);
          }
        }}
      >
        {node.type === "folder"
          ? isOpen
            ? "📂 " + node.text
            : "📁 " + node.text
          : "📄 " + node.text}
      </span>
      {node.type === "folder" && (
        <>
          <FiFilePlus
            onClick={() => {
              if (!isOpen) {
                onToggle();
              }
              handleSubmit({
                text: node.text,
                parent: node.id,
                droppable: node.droppable,
                type: "file",
                data: {
                  fileType: "file",
                },
              });
            }}
            className="text-green-600 cursor-pointer hover:text-green-400"
            title="Add File"
          />
          <FiFolderPlus
            onClick={() => {
              if (!isOpen) {
                onToggle();
              }
              handleSubmit({
                text: node.text,
                parent: node.id,
                droppable: node.droppable,
                type: "folder",

                data: {
                  fileType: "folder",
                },
              });
            }}
            className="text-blue-600 cursor-pointer hover:text-blue-400"
            title="Add Folder"
          />
        </>
      )}
      <FiTrash2
        onClick={() => onDelete(node.id)}
        className="text-red-600 cursor-pointer hover:text-red-400"
        title="Delete"
      />
    </div>
  );
};

export default TreeNode;
