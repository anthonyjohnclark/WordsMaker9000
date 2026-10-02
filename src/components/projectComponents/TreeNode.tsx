import { NodeModel } from "@minoru/react-dnd-treeview";
import { FiFilePlus, FiFolderPlus, FiTrash2, FiEdit, FiFolder, FiFileText } from "react-icons/fi";
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
            ? "var(--selection-bg)"
            : "transparent",
      }}
      className="sidebar-tree-row p-2 rounded cursor-pointer flex items-center gap-2 group"
      onClick={() => {
        if (node.data?.fileType === "folder") {
          onToggle();
        } else {
          project.loadFileContent(node as ExtendedNodeModel);
        }
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {node.data?.fileType === "folder" ? (
          <FiFolder
            size={16}
            className="shrink-0"
            style={{ color: "var(--text-secondary)" }}
            title={isOpen ? "Collapse folder" : "Expand folder"}
            aria-hidden="true"
          />
        ) : (
          <FiFileText size={16} className="shrink-0" style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
        )}
        <span className="truncate" title={node.text}>{node.text}</span>
      </span>
      <div className="flex items-center gap-2 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
              className="sidebar-row-action cursor-pointer"
              
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
              className="sidebar-row-action cursor-pointer"
              
              title="Add Folder"
            />
            <FiEdit
              onClick={() =>
                modal.renderModal({
                  modalBody: <RenameModal node={node} />,
                })
              }
              className="sidebar-row-action cursor-pointer"
              
              title="Rename"
            />
          </>
        )}
        <FiTrash2
          onClick={(e) => {
            modal.renderModal({
              modalBody: <DeleteConfirmationModal node={node} />,
            });
            e.stopPropagation();
          }}
          className="sidebar-row-action sidebar-row-delete cursor-pointer"
          title="Delete"
        />
      </div>
    </div>
  );
};

export default TreeNode;
