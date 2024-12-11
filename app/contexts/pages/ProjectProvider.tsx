"use client";
// context/ProjectContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import {
  ExtendedNodeModel,
  NodeData,
} from "../../projects/[projectName]/types/ProjectPageTypes";

import {
  deleteFile,
  ProjectMetadata,
  readFile,
  fetchFullMetadata,
  saveFile,
  updateMetadata,
} from "../../utils/fileManager";

import {
  DropOptions,
  getDescendants,
  NodeModel,
} from "@minoru/react-dnd-treeview";

import { v4 as uuidv4 } from "uuid";

import { calculateTreeWordCount } from "WordsMaker9000/app/utils/helpers";

interface ProjectContextProps {
  projectName: string;
  treeData: ExtendedNodeModel[];
  setTreeData: React.Dispatch<React.SetStateAction<ExtendedNodeModel[]>>;
  selectedFile: ExtendedNodeModel | null;
  setSelectedFile: React.Dispatch<
    React.SetStateAction<ExtendedNodeModel | null>
  >;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleTreeDataChange: (newTreeData: ExtendedNodeModel[]) => void;
  saveFileContent: (content: string) => Promise<void>;
  loadFileContent(node: ExtendedNodeModel): Promise<void>;
  handleDrop: (newTree: NodeModel<NodeData>[], options: DropOptions) => void;
  handleSubmit: (newNode: ExtendedNodeModel | null) => Promise<void>;
  handleDelete: (
    id: number,
    fileId: string | undefined,
    type: "file" | "folder" | undefined
  ) => Promise<void>;
  handleRename: (id: number, newName: string) => void;
  handleModalOpen: (open: boolean) => void;
  fileContent: string | null;
  isModalOpen: boolean;
  fileSavedMessage: boolean;
  error: string | null;
  handleFileNameChange: (name: string) => void;
  projectMetadata: ProjectMetadata;
  isProjectPageLoading: boolean;
  isEditorLoading: boolean;
  setIsEditorLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fileSaveInProgress: boolean;
  setFileSaveInProgress: React.Dispatch<React.SetStateAction<boolean>>;
}

const ProjectContext = createContext<ProjectContextProps | undefined>(
  undefined
);

export const ProjectProvider: React.FC<{
  projectName: string;
  children: React.ReactNode;
}> = ({ projectName, children }) => {
  const [treeData, setTreeData] = useState<ExtendedNodeModel[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtendedNodeModel | null>(
    null
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileSavedMessage, setFileSavedMessage] = useState(false);
  const [isProjectPageLoading, setIsProjectPageLoading] = useState(true);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [fileSaveInProgress, setFileSaveInProgress] = useState(false);

  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>({
    projectName: "",
    treeData: [],
    lastModified: new Date(),
    createDate: new Date(),
    wordCount: 0,
  });

  // New state for pending metadata
  const [pendingMetadata, setPendingMetadata] =
    useState<ProjectMetadata | null>(null);

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
        // Introduce a delay
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms = 1 second

        const metadata = await fetchFullMetadata(projectName);
        if (!metadata.projectName || !metadata.treeData) {
          throw new Error("Invalid metadata structure.");
        }
        setTreeData(metadata.treeData);
        setProjectMetadata(metadata);
        setIsProjectPageLoading(false);
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

    const totalWordCount = calculateTreeWordCount(newTreeData);

    setPendingMetadata({
      ...projectMetadata,
      projectName,
      treeData: newTreeData,
      wordCount: totalWordCount,
      lastModified: new Date(), // Update word count
    });
  };

  const handleModalOpen = (open: boolean) => {
    setIsModalOpen(open);
  };

  const handleFileNameChange = (newName: string) => {
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
      ) as ExtendedNodeModel[];

      // Update selectedFile to reflect the changes
      const updatedSelectedFile = updatedTree.find(
        (node) => node.id === selectedFile?.id
      );

      if (updatedSelectedFile) {
        setSelectedFile({
          ...updatedSelectedFile,
          data: {
            ...updatedSelectedFile.data,
            fileType: updatedSelectedFile?.data?.fileType ?? "file", // Provide a default value
          },
        } as ExtendedNodeModel);
      }

      return updatedTree;
    });
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

    // Update treeData by filtering out the deleted node and its descendants
    const deleteIds = [
      id,
      ...getDescendants(treeData, id).map((node) => node.id),
    ];
    const newTree = treeData.filter((node) => !deleteIds.includes(node.id));
    handleTreeDataChange(newTree); // Update state

    // Recalculate word count after treeData is updated
    const updatedWordCount = calculateTreeWordCount(newTree);
    setProjectMetadata((prevMetadata) => ({
      ...prevMetadata,
      wordCount: updatedWordCount,
      lastModified: new Date(), // Update lastModified to reflect the change
    }));

    setSelectedFile(null);
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

  const handleSubmit = async (newNode: ExtendedNodeModel | null) => {
    if (!newNode) return;
    const newItem: ExtendedNodeModel = {
      id: 0,
      text: newNode.text,
      parent: newNode?.parent ?? 0,
      droppable: true,
      data: {
        fileType: newNode?.data?.fileType ?? "file",
        fileName: newNode.text,
        fileId: uuidv4(),
        createDate: new Date(),
        lastModified: new Date(),
        wordCount: 0,
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

    if (newItem?.data?.fileType === "file") setSelectedFile(newItem);
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
    async function saveTreeData() {
      try {
        const metadata = {
          ...projectMetadata,
          treeData,
          lastModified: new Date(),
        };
        console.log(console.log("saving tree:", treeData));

        if (metadata.treeData && metadata.treeData.length !== 0) {
          updateMetadata(projectName, metadata);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to save project data.");
      }
    }

    saveTreeData();
  }, [projectMetadata, projectName, treeData]);

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

    setSelectedFile(node);

    setIsEditorLoading(true);

    try {
      const content = await readFile(projectName, node?.data?.fileId);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms = 1 second

      setFileContent(content);
      setIsEditorLoading(false);
    } catch (err) {
      console.error("Error reading file:", err);
      setError("Failed to load file content.");
    }
  }

  const saveFileContent = useCallback(
    async (content: string) => {
      if (selectedFile) {
        try {
          setFileSaveInProgress(true);

          await saveFile(projectName, selectedFile.data?.fileId, content);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms = 1 second

          setTreeData((prevTreeData) => {
            const updatedTreeData = prevTreeData.map((node) =>
              node.id === selectedFile?.id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      wordCount: selectedFile.data?.wordCount,
                      lastModified: new Date(),
                    },
                  }
                : node
            ) as ExtendedNodeModel[];

            // Update project metadata with the updated tree data
            const projectWordCount = calculateTreeWordCount(updatedTreeData);

            setProjectMetadata((prevMetadata) => ({
              ...prevMetadata,
              lastModified: new Date(),
              wordCount: projectWordCount,
            }));

            return updatedTreeData;
          });

          setSelectedFile({
            ...selectedFile,
            data: {
              ...(selectedFile.data as NodeData),
              lastModified: new Date(),
            },
          });

          setFileContent(content);
          setFileSaveInProgress(false);

          setFileSavedMessage(true);
          setTimeout(() => setFileSavedMessage(false), 3000); // Hide after 3 seconds

          console.log("File auto-saved.", content);
        } catch (err) {
          console.error("Error saving file:", err);
          setError("Failed to save file content.");
        }
      }
    },
    [selectedFile, projectName]
  );

  return (
    <ProjectContext.Provider
      value={{
        projectName,
        treeData,
        setTreeData,
        selectedFile,
        setSelectedFile,
        isSidebarOpen,
        setIsSidebarOpen,
        handleTreeDataChange,
        saveFileContent,
        loadFileContent,
        handleDrop,
        handleSubmit,
        handleDelete,
        handleRename,
        handleModalOpen,
        fileContent,
        isModalOpen,
        fileSavedMessage,
        error,
        handleFileNameChange,
        projectMetadata,
        isProjectPageLoading,
        isEditorLoading,
        setIsEditorLoading,
        fileSaveInProgress,
        setFileSaveInProgress,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProjectContext must be used within a ProjectProvider");
  }
  return context;
};
