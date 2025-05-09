import React, { useEffect } from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { FiX, FiMenu, FiFilePlus, FiFolderPlus } from "react-icons/fi";
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
        className={`${
          project.isSidebarOpen ? "w-[16rem]" : "w-12"
        } bg-gray-900 text-white flex flex-col transition-all duration-300 ease-in-out`}
      >
        {/* Header with Toggle Button, Project Name, and Action Buttons */}
        <div className="flex items-center justify-between p-3 pb-0">
          {/* Left Section: Toggle Button and Project Name */}
          <div className="flex items-center">
            {/* Toggle Button */}
            <button
              onClick={() => project.setIsSidebarOpen((prev) => !prev)}
              className="focus:outline-none"
            >
              {project.isSidebarOpen ? (
                <FiX className="text-2xl" />
              ) : (
                <FiMenu className="text-2xl" />
              )}
            </button>

            {project.isSidebarOpen && (
              <div className="ml-4">
                <h2 className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis text-white">
                  {project.projectMetadata.projectType}
                </h2>
              </div>
            )}
          </div>

          {/* Right Section: Action Buttons */}
          {project.isSidebarOpen && (
            <div className="flex gap-4 pl-4">
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
                className="text-green-500 cursor-pointer hover:text-green-400 text-xl"
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
                className="text-blue-500 cursor-pointer hover:text-blue-400 text-xl"
                title="Add Folder"
              />
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        {project.isSidebarOpen ? (
          <div className="p-4 h-full overflow-y-auto scrollbar-hide">
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
                      borderBottom: "2px solid white",
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
          <div className="p-4 text-center text-sm"></div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
