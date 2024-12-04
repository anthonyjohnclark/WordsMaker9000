import React from "react";
import { FiFilePlus, FiFolderPlus, FiTrash2 } from "react-icons/fi";
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
  handleSubmit,
}: TreeNodeProps) => {
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
              className="text-green-600 cursor-pointer hover:text-green-400"
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
              className="text-blue-600 cursor-pointer hover:text-blue-400"
              title="Add Folder"
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
          className="text-red-600 cursor-pointer hover:text-red-400"
          title="Delete"
        />
      </div>
    </div>
  );
};

export default TreeNode;
