import { NodeModel } from "@minoru/react-dnd-treeview";
import { FiFilePlus, FiFolderPlus, FiTrash2, FiEdit } from "react-icons/fi";
import { useModal } from "../../contexts/global/ModalContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { NodeData, ExtendedNodeModel } from "../../types/ProjectPageTypes";
import { AddFileFolderModal } from "./modals/AddFileFolderModal";
import { DeleteConfirmationModal } from "./modals/DeleteConfirmationModal";
import { RenameModal } from "./modals/RenameModal";

type TreeNodeProps = {
  node: NodeModel<NodeData> | ExtendedNodeModel;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
};

const TreeNode = ({ node, depth, isOpen, onToggle }: TreeNodeProps) => {
  const modal = useModal();

  const project = useProjectContext();

  return (
    <div
      style={{
        marginLeft: depth * 20,
        backgroundColor:
          project.selectedFile?.id === node.id
            ? "rgba(59, 130, 246, 0.2)"
            : "transparent",
      }}
      className="p-2 cursor-pointer flex items-center gap-2 group"
      onClick={() => {
        if (node.data?.fileType === "folder") {
          onToggle();
        } else {
          project.loadFileContent(node as ExtendedNodeModel);
        }
      }}
    >
      <span>
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
                modal.renderModal({
                  modalBody: (
                    <AddFileFolderModal
                      newNode={{
                        id: 0,
                        text: "",
                        parent: node.id as number,
                        droppable: node.droppable,
                        data: {
                          fileId: "",
                          fileName: "",
                          fileType: "file",
                          lastModified: new Date(),
                          createDate: new Date(),
                          wordCount: 0,
                        },
                      }}
                    />
                  ),
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
                modal.renderModal({
                  modalBody: (
                    <AddFileFolderModal
                      newNode={{
                        id: 0,
                        text: "",
                        parent: node.id as number,
                        droppable: node.droppable,
                        data: {
                          fileId: "",
                          fileName: "",
                          fileType: "folder",
                          lastModified: new Date(),
                          createDate: new Date(),
                          wordCount: 0,
                        },
                      }}
                    />
                  ),
                });
              }}
              className="text-blue-500 cursor-pointer hover:text-blue-300"
              title="Add Folder"
            />
            <FiEdit
              onClick={() =>
                modal.renderModal({
                  modalBody: <RenameModal node={node} />,
                })
              }
              className="text-yellow-500 cursor-pointer hover:text-yellow-300"
              title="Rename"
            />
          </>
        )}
        <FiTrash2
          onClick={() =>
            modal.renderModal({
              modalBody: <DeleteConfirmationModal node={node} />,
            })
          }
          className="text-red-500 cursor-pointer hover:text-red-300"
          title="Delete"
        />
      </div>
    </div>
  );
};

export default TreeNode;
