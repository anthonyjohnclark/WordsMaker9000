import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  BaseDirectory,
  remove,
  copyFile,
} from "@tauri-apps/plugin-fs";
import { ExtendedNodeModel } from "../projects/[projectName]/types/ProjectPageTypes";
import { join } from "path";

const BASE_DIR = "Projects";
const BACKUP_DIR = "WordsMaker3000Backups";

export interface ProjectMetadataSummary {
  projectName: string;
  lastModified: Date | null;
  createDate: Date;
  wordCount: number;
  lastBackedUp: Date | null;
}

export interface ProjectMetadata extends ProjectMetadataSummary {
  treeData?: ExtendedNodeModel[];
}

// Ensure the base directory exists
export async function ensureBaseDirectory() {
  await mkdir(BASE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

export async function ensureBaseBackupDirectory() {
  await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.Document, recursive: true });
}

// Create a new project
export async function createProject(projectName: string) {
  const projectPath = `${BASE_DIR}/${projectName}`;
  const metadataPath = `${projectPath}/metadata.json`;

  // Create project folder
  await mkdir(projectPath, { baseDir: BaseDirectory.AppData });

  // Initialize metadata for the project
  const metadata: ProjectMetadata = {
    projectName,
    treeData: [],
    lastModified: null,
    createDate: new Date(),
    wordCount: 0,
    lastBackedUp: null,
  };

  await writeTextFile(metadataPath, JSON.stringify(metadata), {
    baseDir: BaseDirectory.AppData,
  });

  return projectPath;
}

// Delete an entire project
export async function deleteProject(projectName: string) {
  const projectPath = `${BASE_DIR}/${decodeURIComponent(projectName)}`;

  await remove(projectPath, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  });
}

// List project summaries
export async function listProjectsSummary(): Promise<ProjectMetadataSummary[]> {
  const projects = await readDir(BASE_DIR, { baseDir: BaseDirectory.AppData });

  const projectSummaries = await Promise.all(
    projects.map(async (project) => {
      const metadataPath = `${BASE_DIR}/${project.name}/metadata.json`;
      const content = await readTextFile(metadataPath, {
        baseDir: BaseDirectory.AppData,
      });
      const { projectName, createDate, lastModified, wordCount, lastBackedUp } =
        JSON.parse(content);
      return { projectName, createDate, lastModified, wordCount, lastBackedUp };
    })
  );

  return projectSummaries.filter((metadata) => metadata !== null);
}

// List all projects
// List all projects with their metadata
export async function listProjectsWithMetadata() {
  const projects = await readDir(BASE_DIR, { baseDir: BaseDirectory.AppData });

  const projectMetadataPromises = projects.map(async (project) => {
    const metadataPath = `${BASE_DIR}/${project.name}/metadata.json`;
    const content = await readTextFile(metadataPath, {
      baseDir: BaseDirectory.AppData,
    });
    return JSON.parse(content) as ProjectMetadata;
  });

  const metadataList = await Promise.all(projectMetadataPromises);

  // Filter out any projects where metadata could not be read
  return metadataList.filter((metadata) => metadata !== null);
}

// Read metadata for a project
export async function fetchFullMetadata(
  projectName: string
): Promise<ProjectMetadata> {
  const metadataPath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/metadata.json`;

  const content = await readTextFile(metadataPath, {
    baseDir: BaseDirectory.AppData,
  });

  return JSON.parse(content) as ProjectMetadata;
}

// Recursive function to copy files and directories
async function copyDirectoryContents(
  sourcePath: string,
  destinationPath: string
) {
  const entries = await readDir(sourcePath, { baseDir: BaseDirectory.AppData });

  for (const entry of entries) {
    const sourceEntryPath = await join(sourcePath, entry.name);
    const destinationEntryPath = await join(destinationPath, entry.name);

    if (entry.isDirectory) {
      await mkdir(destinationEntryPath, { baseDir: BaseDirectory.AppData });
      await copyDirectoryContents(sourceEntryPath, destinationEntryPath);
    } else {
      await copyFile(sourceEntryPath, destinationEntryPath, {
        fromPathBaseDir: BaseDirectory.AppData,
        toPathBaseDir: BaseDirectory.Document,
      });
    }
  }
}

// Backup a project
export async function backupProject(projectName: string) {
  const projectPath = `${BASE_DIR}/${projectName}`;
  const backupPath = `${BACKUP_DIR}/${projectName}`;

  // Ensure the backup directory exists
  await mkdir(backupPath, { baseDir: BaseDirectory.Document, recursive: true });

  // Copy the contents of the project directory to the backup directory
  await copyDirectoryContents(projectPath, backupPath);
}

// Write metadata for a project
export async function updateMetadata(
  projectName: string,
  metadata: Partial<ProjectMetadata>
) {
  const metadataPath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/metadata.json`;

  const existingMetadata = await fetchFullMetadata(projectName);

  console.log(metadata.lastBackedUp);

  const updatedMetadata = { ...existingMetadata, ...metadata };

  await writeTextFile(metadataPath, JSON.stringify(updatedMetadata), {
    baseDir: BaseDirectory.AppData,
  });
}

// Read file content
export async function readFile(
  projectName: string,
  fileId: string | undefined
): Promise<string> {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;

  const fileContent = await readTextFile(filePath, {
    baseDir: BaseDirectory.AppData,
  });

  const parsedContent = JSON.parse(fileContent);
  return parsedContent.content || ""; // Return content field from JSON
}

// Save file content
export async function saveFile(
  projectName: string,
  fileId: string | undefined,
  content: string
) {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;

  const fileData = JSON.stringify({ content });
  await writeTextFile(filePath, fileData, { baseDir: BaseDirectory.AppData });
}

// Delete a file
export async function deleteFile(
  projectName: string,
  fileId: string | undefined
) {
  const filePath = `${BASE_DIR}/${decodeURIComponent(
    projectName
  )}/${fileId}.json`;

  await remove(filePath, { baseDir: BaseDirectory.AppData });
}
