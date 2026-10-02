import React, { useEffect } from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import {
  FiFilePlus,
  FiFolderPlus,
} from "react-icons/fi";
import { DndProvider, Tree } from "@minoru/react-dnd-treeview";
import { HTML5Backend } from "react-dnd-html5-backend";
import { AddFileFolderModal } from "./modals/AddFileFolderModal";
import { useModal } from "../../contexts/global/ModalContext";
import TreeNode from "./TreeNode";

const Sidebar: React.FC = () => {
  const project = useProjectContext();
  const modal = useModal();

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.ctrlKey) {
        if (event.key === "ArrowRight") {
          // Ctrl + Right Arrow toggles the sidebar
          event.preventDefault();
          project.setIsSidebarOpen((prev) => !prev);
        } else if (event.key === "ArrowLeft" && project.isSidebarOpen) {
          // Ctrl + Left Arrow collapses the sidebar if expanded
          event.preventDefault();
          project.setIsSidebarOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [project]);

  return (
    <>
      <div
        id="project-sidebar"
        className={`${
          project.isSidebarOpen ? "w-[16rem]" : "w-0"
        } flex shrink-0 flex-col mb-2 rounded-b-2xl overflow-hidden transition-[width,background-color,border-color] duration-300 ease-in-out motion-reduce:transition-none`}
        aria-hidden={!project.isSidebarOpen}
        style={{
          background: project.isSidebarOpen ? "var(--bg-primary)" : "var(--editor-bg)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: project.isSidebarOpen ? "var(--border-color)" : "transparent",
          borderRightWidth: project.isSidebarOpen ? "1px" : "0",
          borderRightStyle: "solid",
          borderRightColor: project.isSidebarOpen ? "var(--border-color)" : "transparent",
          color: "var(--text-primary)",
        }}
      >
        {/* Header with Project Name and Action Buttons */}
        <div className={`flex h-16 shrink-0 items-center justify-between ${project.isSidebarOpen ? "px-3" : "px-0"}`}>
          {/* Left Section: Project Name */}
          <div className={`flex items-center min-w-0 flex-1 ${project.isSidebarOpen ? "" : "justify-center"}`}>
            {project.isSidebarOpen && (
              <div className="flex h-8 min-w-0 items-center">
                <h2
                  className="editor-document-title font-normal text-2xl leading-none whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ color: "var(--text-primary)" }}
                >
                  {project.projectMetadata.projectType}
                </h2>
              </div>
            )}
          </div>

          {/* Right Section: Action Buttons */}
          {project.isSidebarOpen && (
            <div className="flex h-8 items-center gap-3 pl-2 flex-shrink-0">
              <FiFilePlus
                onClick={() => {
                  modal.renderModal({
                    modalBody: (
                      <AddFileFolderModal
                        newNode={{
                          id: 0,
                          text: "",
                          parent: 0,
                          droppable: true,
                          data: {
                            fileType: "file",
                            fileName: "",
                            fileId: "",
                            lastModified: new Date(),
                            createDate: new Date(),
                            wordCount: 0,
                          },
                        }}
                      />
                    ),
                  });
                }}
                className="block cursor-pointer text-xl"
                style={{ color: "var(--text-secondary)" }}
                title="Add File"
              />
              <FiFolderPlus
                onClick={() => {
                  modal.renderModal({
                    modalBody: (
                      <AddFileFolderModal
                        newNode={{
                          id: 0,
                          text: "",
                          parent: 0,
                          droppable: true,
                          data: {
                            fileType: "folder",
                            fileName: "",
                            fileId: "",
                            lastModified: new Date(),
                            createDate: new Date(),
                            wordCount: 0,
                          },
                        }}
                      />
                    ),
                  });
                }}
                className="block cursor-pointer text-xl"
                style={{ color: "var(--text-secondary)" }}
                title="Add Folder"
              />
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        {project.isSidebarOpen ? (
          <div className="px-3 pt-1 pb-4 min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            <DndProvider backend={HTML5Backend}>
              <Tree
                tree={project.treeData}
                rootId={0}
                initialOpen={true}
                sort={false}
                enableAnimateExpand={true}
                insertDroppableFirst={false}
                onDrop={project.handleDrop}
                dropTargetOffset={5}
                canDrop={(_tree, { dragSource, dropTarget }) => {
                  if (!dropTarget) return true; // Allow dropping into the root
                  if (
                    (dragSource?.data?.fileType === "folder" &&
                      dropTarget?.data?.fileType === "file") ||
                    (dragSource?.data?.fileType === "file" &&
                      dropTarget?.data?.fileType === "file")
                  ) {
                    return false; // Prevent folders and files from being dropped into files
                  }
                  return true; // Allow all other drops
                }}
                placeholderRender={(_node, { depth }) => (
                  <div
                    style={{
                      padding: depth,
                      borderBottom: "2px solid var(--text-primary)",
                    }}
                  ></div>
                )}
                render={(node, { depth, isOpen, onToggle }) => (
                  <TreeNode
                    node={node}
                    depth={depth}
                    isOpen={isOpen}
                    onToggle={onToggle}
                  />
                )}
              />
            </DndProvider>
          </div>
        ) : (
          <div className="flex-1"></div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
