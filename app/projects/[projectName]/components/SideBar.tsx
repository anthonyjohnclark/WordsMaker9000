"use client";

import React from "react";
import { useProjectContext } from "gilgamesh/app/contexts/pages/ProjectProvider";
import { useRouter } from "next/navigation";
import { FiX, FiMenu, FiFilePlus, FiFolderPlus } from "react-icons/fi";
import { DndProvider, Tree } from "@minoru/react-dnd-treeview";
import { HTML5Backend } from "react-dnd-html5-backend";
import TreeNode from "gilgamesh/app/projects/[projectName]/components/TreeNode";
import { useModal } from "gilgamesh/app/contexts/global/ModalContext";
import { AddFileFolderModal } from "./modals/AddFileFolderModal";

const Sidebar: React.FC = () => {
  const project = useProjectContext();
  const router = useRouter();

  const modal = useModal();

  return (
    <>
      {" "}
      <div
        className={`${
          project.isSidebarOpen ? "w-64" : "w-12"
        } bg-gray-800 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Header */}
        {project.isSidebarOpen && (
          <div className="text-center pt-4 ">
            <h1
              className="text-xl pt-4 font-bold text-yellow-600 cursor-pointer transform transition duration-200 hover:scale-110 hover:text-yellow-400"
              onClick={() => router.push("/")}
            >
              Gilgamesh
            </h1>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => project.setIsSidebarOpen((prev) => !prev)}
          className="p-3 focus:outline-none"
        >
          {project.isSidebarOpen ? (
            <FiX className="text-2xl" />
          ) : (
            <FiMenu className="text-2xl" />
          )}
        </button>

        {/* Sidebar Content */}
        {project.isSidebarOpen ? (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg pr-5">
                {decodeURIComponent(project.projectName)}
              </h2>
              <div className="flex gap-4">
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
                            },
                          }}
                        />
                      ),
                    });
                  }}
                  className="text-green-600 cursor-pointer hover:text-green-400 text-xl"
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
                            },
                          }}
                        />
                      ),
                    });
                  }}
                  className="text-blue-600 cursor-pointer hover:text-blue-400 text-xl"
                  title="Add Folder"
                />
              </div>
            </div>
            {project.error ? (
              <p className="text-red-600">{project.error}</p>
            ) : (
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
                  canDrop={(tree, { dragSource, dropTarget }) => {
                    if (!dropTarget) return true; // Allow dropping into the root
                    if (
                      dragSource?.data?.fileType === "folder" &&
                      dropTarget?.data?.fileType === "file"
                    ) {
                      return false; // Prevent folders from being dropped into files
                    }
                    return true; // Allow all other drops
                  }}
                  placeholderRender={(node, { depth }) => (
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
            )}
          </div>
        ) : (
          <div className="p-4 text-center text-sm"></div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
