"use client";

import React, { useEffect, useState } from "react";

import {
  Tree,
  NodeModel,
  DndProvider,
  MultiBackend,
  getBackendOptions,
  getDescendants,
} from "@minoru/react-dnd-treeview";

import {
  readMetadata,
  addItemToProject,
  deleteItemFromMetadata,
  readFileFromMetadata,
  saveFileToMetadata,
  updateMetadata,
} from "../../utils/fileManager";

import { v4 as uuidv4 } from "uuid";

import dynamic from "next/dynamic";
import TreeNode from "gilgamesh/app/components/TreeNode";
import { HTML5Backend } from "react-dnd-html5-backend";
import { FiFilePlus, FiFolderPlus, FiMenu, FiX } from "react-icons/fi";

export interface ExtendedNodeModel extends NodeModel {
  text: string;
  droppable: boolean;
  children?: string[];
}

const TextEditor = dynamic(() => import("../../components/TextEditor"), {
  ssr: false,
});

const ProjectPageClient = ({ projectName }: { projectName: string }) => {
  const [treeData, setTreeData] = useState<ExtendedNodeModel[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtendedNodeModel | null>(
    null
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [folderOpenState, setFolderOpenState] = useState<
    Record<string, boolean>
  >({});

  console.log(treeData);

  const handleDelete = (id) => {
    const deleteIds = [
      id,
      ...getDescendants(treeData, id).map((node) => node.id),
    ];
    const newTree = treeData.filter((node) => !deleteIds.includes(node.id));

    setTreeData(newTree);
  };

  const handleSubmit = (newNode) => {
    const title = prompt(`Enter ${newNode.type} name:`);
    if (!title) return;

    const newItem = {
      text: title,
      parent: newNode.parent,
      droppable: true,
      type: newNode.type,
      data: {
        fileType: newNode.type,
        fileName: title,
        fileId: uuidv4(),
      },
    };

    const lastId = getLastId(treeData) + 1;

    console.log({
      ...newItem,
      id: lastId,
    });

    setTreeData([
      ...treeData,
      {
        ...newItem,
        id: lastId,
      },
    ]);

    toggleFolderState(newNode.parent, true);
  };

  const getLastId = (treeData) => {
    const reversedArray = [...treeData].sort((a, b) => {
      if (a.id < b.id) {
        return 1;
      } else if (a.id > b.id) {
        return -1;
      }

      return 0;
    });

    if (reversedArray.length > 0) {
      return reversedArray[0].id;
    }

    return 0;
  };

  const reorderArray = (
    array: ExtendedNodeModel[],
    sourceIndex: number,
    targetIndex: number
  ) => {
    const newArray = [...array];
    const element = newArray.splice(sourceIndex, 1)[0];
    newArray.splice(targetIndex, 0, element);
    return newArray;
  };

  // useEffect(() => {
  //   async function fetchMetadata() {
  //     try {
  //       const metadata = await readMetadata(projectName);
  //       if (!metadata.rootOrder || !metadata.files) {
  //         throw new Error("Invalid metadata structure.");
  //       }

  //       const tree = buildTree(metadata);

  //       console.log(console.log("beginning tree:", tree));
  //       setTreeData(tree);

  //       // Initialize folder open state based on metadata
  //       const initialOpenState: Record<string, boolean> = {};
  //       tree.forEach((node) => {
  //         if (node.type === "folder") {
  //           initialOpenState[node.id] = false; // Default all folders to closed
  //         }
  //       });
  //       setFolderOpenState(initialOpenState);
  //     } catch (err) {
  //       console.error(err);
  //       setError("Failed to load project data.");
  //     }
  //   }
  //   fetchMetadata();
  // }, [projectName]);

  const handleDrop = (newTree, e) => {
    console.log(newTree);
    const { dragSourceId, dropTargetId, destinationIndex } = e;
    if (
      typeof dragSourceId === "undefined" ||
      typeof dropTargetId === "undefined"
    )
      return;
    const start = treeData.find((v) => v.id === dragSourceId);
    const end = treeData.find((v) => v.id === dropTargetId);

    if (
      start?.parent === dropTargetId &&
      start &&
      typeof destinationIndex === "number"
    ) {
      setTreeData((treeData) => {
        const output = reorderArray(
          treeData,
          treeData.indexOf(start),
          destinationIndex
        );
        return output;
      });
    }

    if (
      start?.parent !== dropTargetId &&
      start &&
      typeof destinationIndex === "number"
    ) {
      if (
        getDescendants(treeData, dragSourceId).find(
          (el) => el.id === dropTargetId
        ) ||
        dropTargetId === dragSourceId ||
        (end && !end?.droppable)
      )
        return;
      setTreeData((treeData) => {
        const output = reorderArray(
          treeData,
          treeData.indexOf(start),
          destinationIndex
        );
        const movedElement = output.find((el) => el.id === dragSourceId);
        if (movedElement) movedElement.parent = dropTargetId;
        return output;
      });
    }
  };

  async function handleAddItem(
    parentId: string | null,
    type: "file" | "folder"
  ) {
    const title = prompt(`Enter ${type} name:`);
    if (!title) return;

    try {
      // Add the item to the project metadata
      await addItemToProject(projectName, newItem);

      // Refetch metadata to update the tree
      const metadata = await readMetadata(projectName);
      const updatedTree = Object.values(metadata.files).map((file) => ({
        id: file.id,
        text: file.title || "Untitled",
        parent: file.parent ?? 0,
        droppable: true,
        children: file.children || [],
        type: file.type,
      }));

      // Update the tree state
      setTreeData(updatedTree);
    } catch (err) {
      console.error("Failed to add item:", err);
      setError("Failed to add item.");
    }
  }

  async function handleDeleteItem(nodeId: string) {
    try {
      await deleteItemFromMetadata(projectName, nodeId);
      setTreeData((prev) =>
        prev.filter((node) => node.id !== nodeId && node.parent !== nodeId)
      );
    } catch (err) {
      console.error("Failed to delete item:", err);
      setError("Failed to delete item.");
    }
  }

  async function loadFileContent(node: ExtendedNodeModel) {
    if (node.type === "folder") return; // Skip folders
    try {
      const content = await readFileFromMetadata(projectName, node.id);
      setSelectedFile(node);
      setFileContent(content);
    } catch (err) {
      console.error("Error reading file:", err);
      setError("Failed to load file content.");
    }
  }

  async function saveFileContent(content: string) {
    if (selectedFile) {
      try {
        await saveFileToMetadata(projectName, selectedFile.id, content);
        setFileContent(content);
        alert("File saved!");
      } catch (err) {
        console.error("Error saving file:", err);
        setError("Failed to save file content.");
      }
    }
  }

  function toggleFolderState(nodeId: string, isOpen: boolean) {
    setFolderOpenState((prev) => ({
      ...prev,
      [nodeId]: isOpen, // Explicitly set to match `isOpen` from Tree
    }));
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "w-64" : "w-12"
        } bg-gray-800 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="p-3 focus:outline-none"
        >
          {isSidebarOpen ? (
            <FiX className="text-2xl" />
          ) : (
            <FiMenu className="text-2xl" />
          )}
        </button>

        {/* Sidebar Content */}
        {isSidebarOpen ? (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {decodeURIComponent(projectName)}
              </h2>
              <div className="flex gap-4">
                <FiFilePlus
                  onClick={() =>
                    handleSubmit({
                      parent: 0,
                      droppable: true,
                      type: "file",
                    })
                  }
                  className="text-green-600 cursor-pointer hover:text-green-400 text-xl"
                  title="Add File"
                />
                <FiFolderPlus
                  onClick={() =>
                    handleSubmit({
                      parent: 0,
                      droppable: true,
                      type: "folder",
                    })
                  }
                  className="text-blue-600 cursor-pointer hover:text-blue-400 text-xl"
                  title="Add Folder"
                />
              </div>
            </div>
            {error ? (
              <p className="text-red-600">{error}</p>
            ) : (
              <DndProvider backend={HTML5Backend}>
                <Tree<ExtendedNodeModel>
                  tree={treeData}
                  rootId={0} // Root has no parent
                  initialOpen={true}
                  sort={false}
                  enableAnimateExpand={true}
                  insertDroppableFirst={false}
                  onDrop={handleDrop}
                  dropTargetOffset={5}
                  canDrop={(tree, { dragSource, dropTarget }) => {
                    // Allow dropping into the root
                    if (!dropTarget) return true;

                    // Prevent folders from being dropped into files
                    if (
                      dragSource?.type === "folder" &&
                      dropTarget?.type === "file"
                    ) {
                      return false;
                    }

                    // Allow all other drops
                    return true;
                  }}
                  placeholderRender={(node, { depth }) => (
                    <div
                      style={{
                        padding: "5px",
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
                      onDelete={handleDelete}
                      selectedFile={selectedFile}
                      toggleFolderState={toggleFolderState}
                      setSelectedFile={setSelectedFile}
                      loadFileContent={loadFileContent}
                      handleSubmit={handleSubmit}
                      handleDeleteItem={handleDeleteItem}
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

      {/* Main Content */}
      <section
        className={`flex-1 p-4 ${
          isSidebarOpen ? "ml-0" : "ml-12"
        } transition-all duration-300 relative`}
      >
        {selectedFile ? (
          <>
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <h2 className="text-2xl font-semibold text-white-800">
                {selectedFile.text}
              </h2>
            </div>
            <TextEditor
              key={selectedFile.id} // Use the file ID as the key to force remount
              initialContent={fileContent || ""}
              onSave={saveFileContent}
              selectedFile={selectedFile}
            />
          </>
        ) : (
          <p>Select a file to edit</p>
        )}
      </section>
    </div>
  );
};

export default ProjectPageClient;
