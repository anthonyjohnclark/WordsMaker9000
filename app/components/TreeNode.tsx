import React, { forwardRef } from "react";
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
};

// Use forwardRef to ensure drag-and-drop props are handled properly
const TreeNode = forwardRef<HTMLDivElement, TreeNodeProps>(
  (
    {
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
      ...dragAndDropProps // Spread drag-and-drop props
    },
    ref // Ref forwarded for drag-and-drop
  ) => {
    return (
      <div
        ref={ref} // Attach drag-and-drop ref
        {...dragAndDropProps} // Spread drag-and-drop props
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
              toggleFolderState(node.id, !isOpen);
              onToggle();
            } else {
              setSelectedFile(node);
              loadFileContent(node);
            }
          }}
        >
          {node.type === "folder"
            ? isOpen
              ? "📂 " + node.titleText
              : "📁 " + node.titleText
            : "📄 " + node.titleText}
        </span>
        {node.type === "folder" && (
          <>
            <FiFilePlus
              onClick={() => handleAddItem(node.id, "file")}
              className="text-green-600 cursor-pointer hover:text-green-400"
              title="Add File"
            />
            <FiFolderPlus
              onClick={() => handleAddItem(node.id, "folder")}
              className="text-blue-600 cursor-pointer hover:text-blue-400"
              title="Add Folder"
            />
          </>
        )}
        <FiTrash2
          onClick={() => handleDeleteItem(node.id)}
          className="text-red-600 cursor-pointer hover:text-red-400"
          title="Delete"
        />
      </div>
    );
  }
);

TreeNode.displayName = "TreeNode"; // Set displayName for forwardRef components

export default TreeNode;
