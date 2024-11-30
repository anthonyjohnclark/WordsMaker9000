"use client";

import React, { useEffect, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Tree, NodeModel } from "@minoru/react-dnd-treeview";
import {
  readMetadata,
  addItemToProject,
  deleteItemFromMetadata,
  readFileFromMetadata,
  saveFileToMetadata,
} from "../../utils/fileManager";
import dynamic from "next/dynamic";
import {
  FiFilePlus,
  FiFolderPlus,
  FiMenu,
  FiTrash2,
  FiX,
} from "react-icons/fi";

export interface ExtendedNodeModel extends NodeModel {
  text: string;
  droppable: boolean;
  children?: string[];
}

const TextEditor = dynamic(() => import("../../components/TextEditor"), {
  ssr: false,
});

const ProjectPageClient = ({ projectName }: { projectName: string }) => {
  const [fileTree, setFileTree] = useState<ExtendedNodeModel[]>([]);

  const [selectedFile, setSelectedFile] = useState<ExtendedNodeModel | null>(
    null
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [folderOpenState, setFolderOpenState] = useState<
    Record<string, boolean>
  >({});

  console.log(folderOpenState);

  useEffect(() => {
    async function fetchMetadata() {
      try {
        const metadata = await readMetadata(projectName);
        if (!metadata.rootOrder || !metadata.files) {
          throw new Error("Invalid metadata structure.");
        }

        const tree = Object.values(metadata.files).map((file) => ({
          id: file.id,
          text: file.title || "Untitled",
          parent: file.parent || null,
          droppable: file.type === "folder",
          children: file.children || [],
        }));

        setFileTree(tree);

        // Initialize folder open state based on metadata
        const initialOpenState: Record<string, boolean> = {};
        tree.forEach((node) => {
          if (node.droppable) {
            initialOpenState[node.id] = false; // Default all folders to closed
          }
        });
        setFolderOpenState(initialOpenState);
      } catch (err) {
        console.error(err);
        setError("Failed to load project data.");
      }
    }
    fetchMetadata();
  }, [projectName]);

  async function handleAddItem(
    parentId: string | null,
    type: "file" | "folder"
  ) {
    const title = prompt(`Enter ${type} name:`);
    if (!title) return;

    const newItem = {
      id: `${Date.now()}`, // Unique ID
      title,
      type,
      parent: parentId,
    };

    try {
      await addItemToProject(projectName, newItem);
      setFileTree((prev) => [
        ...prev,
        {
          id: newItem.id,
          text: newItem.title,
          parent: parentId,
          droppable: type === "folder",
          children: [],
        },
      ]);
    } catch (err) {
      console.error("Failed to add item:", err);
      setError("Failed to add item.");
    }
  }

  async function handleDeleteItem(nodeId: string) {
    try {
      await deleteItemFromMetadata(projectName, nodeId);
      setFileTree((prev) =>
        prev.filter((node) => node.id !== nodeId && node.parent !== nodeId)
      );
    } catch (err) {
      console.error("Failed to delete item:", err);
      setError("Failed to delete item.");
    }
  }

  async function loadFileContent(node: ExtendedNodeModel) {
    if (node.droppable) return; // Skip folders
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
    <DndProvider backend={HTML5Backend}>
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
                  Project: {decodeURIComponent(projectName)}
                </h2>
                <div className="flex gap-4">
                  <FiFilePlus
                    onClick={() => handleAddItem(null, "file")}
                    className="text-green-600 cursor-pointer hover:text-green-400 text-xl"
                    title="Add File"
                  />
                  <FiFolderPlus
                    onClick={() => handleAddItem(null, "folder")}
                    className="text-blue-600 cursor-pointer hover:text-blue-400 text-xl"
                    title="Add Folder"
                  />
                </div>
              </div>
              {error ? (
                <p className="text-red-600">{error}</p>
              ) : (
                <Tree<ExtendedNodeModel>
                  tree={fileTree}
                  rootId={null} // Root has no parent
                  initialOpen={Object.entries(folderOpenState)
                    .filter(([_, isOpen]) => isOpen)
                    .map(([folderId]) => folderId)} // Pass open folder IDs to initialOpen
                  render={(node, { depth, isOpen, onToggle }) => (
                    <div
                      style={{
                        marginLeft: depth * 20,
                        backgroundColor:
                          selectedFile?.id === node.id
                            ? "rgba(59, 130, 246, 0.2)"
                            : "transparent",
                      }}
                      className="p-2 cursor-pointer flex items-center gap-2"
                    >
                      {/* Folder and File Icons */}
                      <span
                        onClick={() => {
                          if (node.droppable) {
                            toggleFolderState(node.id, !isOpen);
                            onToggle(); // Sync with Tree's internal state
                          } else {
                            loadFileContent(node);
                          }
                        }}
                      >
                        {node.droppable
                          ? isOpen
                            ? "📂 " + node.text
                            : "📁 " + node.text
                          : "📄 " + node.text}
                      </span>
                      {node.droppable && (
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
                  )}
                />
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
    </DndProvider>
  );
};

export default ProjectPageClient;
