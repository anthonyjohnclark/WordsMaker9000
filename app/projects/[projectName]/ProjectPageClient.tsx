"use client";

import React, { useEffect, useState } from "react";
import {
  Tree,
  NodeModel,
  DndProvider,
  getDescendants,
  DropOptions,
} from "@minoru/react-dnd-treeview";
import {
  readMetadata,
  deleteFile,
  readFile,
  saveFile,
  updateMetadata,
} from "../../utils/fileManager";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";
import TreeNode from "gilgamesh/app/components/TreeNode";
import { HTML5Backend } from "react-dnd-html5-backend";
import { FiFilePlus, FiFolderPlus, FiMenu, FiX } from "react-icons/fi";

export type NodeData = {
  fileType: "file" | "folder";
  fileName: string;
  fileId: string;
};

export interface ExtendedNodeModel extends NodeModel<NodeData> {
  parent: number;
}

interface ProjectPageClientProps {
  projectName: string;
}

const TextEditor = dynamic(() => import("../../components/TextEditor"), {
  ssr: false,
});

const ProjectPageClient: React.FC<ProjectPageClientProps> = ({
  projectName,
}) => {
  const [treeData, setTreeData] = useState<ExtendedNodeModel[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtendedNodeModel | null>(
    null
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // New state for pending metadata
  const [pendingMetadata, setPendingMetadata] = useState<{
    projectName: string;
    treeData: ExtendedNodeModel[];
  } | null>(null);

  // Save tree data with a delay (debounced effect)
  useEffect(() => {
    if (!pendingMetadata) return;

    const timeout = setTimeout(async () => {
      try {
        await updateMetadata(pendingMetadata.projectName, pendingMetadata);
        setPendingMetadata(null); // Clear pending metadata after save
      } catch (err) {
        console.error("Error saving metadata:", err);
        setError("Failed to save project data.");
      }
    }, 300); // Adjust delay as needed

    return () => clearTimeout(timeout); // Cleanup timeout on unmount or updates
  }, [pendingMetadata]);

  // Load metadata on initial render
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const metadata = await readMetadata(projectName);
        if (!metadata.projectName || !metadata.treeData) {
          throw new Error("Invalid metadata structure.");
        }
        setTreeData(metadata.treeData);
      } catch (err) {
        console.error(err);
        setError("Failed to load project data.");
      }
    }

    fetchMetadata();
  }, [projectName]);

  // Handle tree data changes and buffer the save operation
  const handleTreeDataChange = (newTreeData: ExtendedNodeModel[]) => {
    setTreeData(newTreeData);
    setPendingMetadata({ projectName, treeData: newTreeData });
  };

  const handleDelete = async (
    id: number,
    fileId: string | undefined,
    type: "file" | "folder" | undefined
  ) => {
    if (type === "file") {
      try {
        await deleteFile(projectName, fileId);
      } catch (err) {
        console.error("Failed to delete file:", err);
        setError("Failed to delete file.");
      }
    } else if (type === "folder") {
      const descendants = getDescendants(treeData, id);

      for (const descendant of descendants) {
        if (descendant?.data?.fileType === "file") {
          try {
            await deleteFile(projectName, descendant.data.fileId);
          } catch (err) {
            console.error(`Failed to delete file ${descendant.text}:`, err);
            setError(`Failed to delete file ${descendant.text}.`);
          }
        } else if (descendant?.data?.fileType === "folder") {
          // Recursively delete the folder and its contents
          await handleDelete(descendant.id as number, undefined, "folder");
        }
      }
    }

    const deleteIds = [
      id,
      ...getDescendants(treeData, id).map((node) => node.id),
    ];
    const newTree = treeData.filter((node) => !deleteIds.includes(node.id));
    handleTreeDataChange(newTree); // Use the handler for updates
  };

  const handleRename = (id: number, newName: string) => {
    handleTreeDataChange(
      treeData.map((node) =>
        node.id === id
          ? ({
              ...node,
              text: newName,
              data: { ...node.data, fileName: newName },
            } as ExtendedNodeModel)
          : node
      )
    );
  };

  const handleSubmit = async (newNode: ExtendedNodeModel) => {
    const title = prompt(`Enter ${newNode?.data?.fileType} name:`);
    if (!title) return;

    const newItem: ExtendedNodeModel = {
      id: 0,
      text: title,
      parent: newNode.parent ?? 0,
      droppable: true,
      data: {
        fileType: newNode?.data?.fileType ?? "file",
        fileName: title,
        fileId: uuidv4(),
      },
    };

    const lastId = getLastId(treeData) + 1;

    if (newNode?.data?.fileType === "file") {
      try {
        await saveFile(projectName, newItem?.data?.fileId, "");
      } catch (err) {
        console.error("Failed to add item:", err);
        setError("Failed to add item.");
      }
    }

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
  };

  const getLastId = (treeData: ExtendedNodeModel[]): number => {
    const reversedArray = [...treeData].sort((a, b) => {
      if (a.id < b.id) {
        return 1;
      } else if (a.id > b.id) {
        return -1;
      }

      return 0;
    });

    if (reversedArray.length > 0) {
      return reversedArray[0].id as number;
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

  useEffect(() => {
    async function fetchMetadata() {
      try {
        const metadata = await readMetadata(projectName);
        if (!metadata.projectName || !metadata.treeData) {
          throw new Error("Invalid metadata structure.");
        }
        console.log(console.log("beginning tree:", metadata.treeData));

        if (metadata.treeData) {
          setTreeData(metadata.treeData);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load project data.");
      }
    }

    fetchMetadata();
  }, [projectName]);

  useEffect(() => {
    async function saveTreeData() {
      try {
        const metadata = { projectName, treeData };
        console.log(console.log("saving tree:", treeData));

        if (metadata.treeData) {
          updateMetadata(projectName, metadata);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to save project data.");
      }
    }

    saveTreeData();
  }, [projectName, treeData]);

  const handleDrop = (newTree: NodeModel<NodeData>[], options: DropOptions) => {
    console.log(newTree);
    const { dragSourceId, dropTargetId, destinationIndex } = options;
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
        if (movedElement) movedElement.parent = dropTargetId as number;
        return output;
      });
    }
  };

  async function loadFileContent(node: ExtendedNodeModel) {
    if (node?.data?.fileType === "folder") return; // Skip folders
    try {
      const content = await readFile(projectName, node?.data?.fileId);
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
        await saveFile(projectName, selectedFile.data?.fileId, content);
        setFileContent(content);
        alert("File saved!");
      } catch (err) {
        console.error("Error saving file:", err);
        setError("Failed to save file content.");
      }
    }
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
                      id: 0,
                      text: "",
                      parent: 0,
                      droppable: true,
                      data: {
                        fileType: "file",
                        fileName: "",
                        fileId: "",
                      },
                    })
                  }
                  className="text-green-600 cursor-pointer hover:text-green-400 text-xl"
                  title="Add File"
                />
                <FiFolderPlus
                  onClick={() =>
                    handleSubmit({
                      id: 0,
                      text: "",
                      parent: 0,
                      droppable: true,
                      data: {
                        fileType: "folder",
                        fileName: "",
                        fileId: "",
                      },
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
                <Tree<NodeData>
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
                      dragSource?.data?.fileType === "folder" &&
                      dropTarget?.data?.fileType === "file"
                    ) {
                      return false;
                    }

                    // Allow all other drops
                    return true;
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
                      handleDelete={handleDelete}
                      selectedFile={selectedFile}
                      setSelectedFile={setSelectedFile}
                      loadFileContent={loadFileContent}
                      handleSubmit={handleSubmit}
                      handleRename={handleRename}
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
      <section className={`flex-1 p-4 ${isSidebarOpen ? "ml-0" : "ml-12"}`}>
        {selectedFile ? (
          <>
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <input
                type="text"
                value={selectedFile?.text || ""}
                onChange={(e) => {
                  const newName = e.target.value;

                  // Update treeData and reselect the file with updated name
                  setTreeData((prevTree) => {
                    const updatedTree = prevTree.map((node) =>
                      node.id === selectedFile?.id
                        ? {
                            ...node,
                            text: newName,
                            data: {
                              ...node.data,
                              fileName: newName,
                              fileType: node?.data?.fileType, // Ensure fileType is not undefined
                            },
                          }
                        : node
                    ) as ExtendedNodeModel[]; // Explicit cast to satisfy the type checker

                    // Update selectedFile to reflect the changes
                    const updatedSelectedFile = updatedTree.find(
                      (node) => node.id === selectedFile?.id
                    );

                    if (updatedSelectedFile) {
                      setSelectedFile({
                        ...updatedSelectedFile,
                        data: {
                          ...updatedSelectedFile.data,
                          fileType:
                            updatedSelectedFile?.data?.fileType ?? "file", // Provide a default value
                        },
                      } as ExtendedNodeModel); // Explicit cast to ensure the correct type
                    }

                    return updatedTree;
                  });
                }}
                className="w-full text-2xl font-semibold text-white bg-black p-2 rounded focus:outline-none focus:ring focus:ring-blue-500"
              />
            </div>
            <TextEditor
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
