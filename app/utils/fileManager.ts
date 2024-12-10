import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  BaseDirectory,
  remove,
} from "@tauri-apps/plugin-fs";
import { ExtendedNodeModel } from "../projects/[projectName]/types/ProjectPageTypes";

const BASE_DIR = "Projects";

export interface ProjectMetadata {
  projectName: string;
  treeData: ExtendedNodeModel[];
  lastModified: Date;
  createDate: Date;
  wordCount: number;
}

// Ensure the base directory exists
export async function ensureBaseDirectory() {
  await mkdir(BASE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

// Create a new project
export async function createProject(projectName: string) {
  const projectPath = `${BASE_DIR}/${projectName}`;
  const metadataPath = `${projectPath}/metadata.json`;

  // Create project folder
  await mkdir(projectPath, { baseDir: BaseDirectory.AppData });

  // Initialize metadata for the project
  const metadata: ProjectMetadata = {
    projectName: projectName,
    treeData: [],
    lastModified: new Date(),
    createDate: new Date(),
    wordCount: 0,
  };
  await writeTextFile(metadataPath, JSON.stringify(metadata), {
    baseDir: BaseDirectory.AppData,
  });

  return projectPath;
}

// List all projects
// List all projects with their metadata
export async function listProjectsWithMetadata() {
  const projects = await readDir(BASE_DIR, { baseDir: BaseDirectory.AppData });

  const projectMetadataPromises = projects.map(async (project) => {
    const metadataPath = `${BASE_DIR}/${project.name}/metadata.json`;

    try {
      const content = await readTextFile(metadataPath, {
        baseDir: BaseDirectory.AppData,
      });
      return JSON.parse(content) as ProjectMetadata;
    } catch (err) {
      console.error(`Error reading metadata for project ${project.name}:`, err);
      return null;
    }
  });

  const metadataList = await Promise.all(projectMetadataPromises);

  // Filter out any projects where metadata could not be read
  return metadataList.filter((metadata) => metadata !== null);
}

// Read metadata for a project
export async function readMetadata(
  projectName: string
): Promise<ProjectMetadata> {
  const metadataPath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/metadata.json`;
  try {
    const content = await readTextFile(metadataPath, {
      baseDir: BaseDirectory.AppData,
    });
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading metadata for project ${projectName}:`, err);
    throw err;
  }
}

// Write metadata for a project
export async function updateMetadata(
  projectName: string,
  metadata: ProjectMetadata
) {
  const metadataPath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/metadata.json`;
  try {
    await writeTextFile(metadataPath, JSON.stringify(metadata), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error(`Error updating metadata for project ${projectName}:`, err);
    throw err;
  }
}

// Read file content from metadata
// Read file content from a JSON file
export async function readFile(
  projectName: string,
  fileId: string | undefined
): Promise<string> {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;
  try {
    const fileContent = await readTextFile(filePath, {
      baseDir: BaseDirectory.AppData,
    });
    const parsedContent = JSON.parse(fileContent);
    return parsedContent.content || ""; // Return content field from JSON
  } catch (err) {
    console.error(`Error reading file content: ${filePath}`, err);
    return ""; // Return an empty string if file is missing
  }
}

// Save file content to metadata
export async function saveFile(
  projectName: string,
  fileId: string | undefined,
  content: string
) {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;

  try {
    const fileData = JSON.stringify({ content }); // Save content in a JSON structure
    await writeTextFile(filePath, fileData, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.error(`Error saving file content: ${filePath}`, err);
    throw err;
  }
}

// Delete an item (file/folder) from the project
export async function deleteFile(
  projectName: string,
  fileId: string | undefined
) {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;

  try {
    await remove(filePath, { baseDir: BaseDirectory.AppData });
    console.log(`File ${filePath} deleted successfully.`);
  } catch (err) {
    console.error(`Failed to delete file: ${err}`);
    throw new Error("Failed to delete the file.");
  }
}
