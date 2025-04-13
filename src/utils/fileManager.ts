import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  BaseDirectory,
  remove,
  copyFile,
  exists,
} from "@tauri-apps/plugin-fs";
import { join } from "path-browserify";
import { ExtendedNodeModel } from "../types/ProjectPageTypes";

export interface UserSettings {
  defaultFontZoom: number;
  defaultSaveInterval: number; // milliseconds
  defaultBackupInterval: number; // milliseconds
  aiSuiteEnabled: boolean;
}

const BASE_DIR = "Projects";
const BACKUP_DIR = "WordsMaker3000Backups";
const USER_DIR = "User";
const SETTINGS_FILE = "settings.json";

export type ProjectType = "novel" | "collection" | "serial" | "novella";

export interface ProjectMetadataSummary {
  projectName: string;
  lastModified: Date | string | null;
  createDate: Date;
  wordCount: number;
  lastBackedUp: Date | null;
  projectType: ProjectType | "";
}

export interface ProjectMetadata extends ProjectMetadataSummary {
  treeData?: ExtendedNodeModel[];
}

export async function saveSettings(settings: UserSettings) {
  try {
    // Ensure the user directory exists
    await mkdir(USER_DIR, { baseDir: BaseDirectory.AppData, recursive: true });

    // Save settings to file
    const filePath = `${USER_DIR}/${SETTINGS_FILE}`;
    await writeTextFile(filePath, JSON.stringify(settings), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

export async function retrieveSettings(): Promise<UserSettings> {
  const defaultSettings: UserSettings = {
    defaultFontZoom: 16,
    defaultSaveInterval: 60000, // 1 minute
    defaultBackupInterval: 3600000, // 1 hour
    aiSuiteEnabled: false,
  };

  const filePath = `${USER_DIR}/${SETTINGS_FILE}`;

  const settingsExist = await exists(filePath, {
    baseDir: BaseDirectory.AppData,
  });

  if (!settingsExist) {
    await saveSettings(defaultSettings);
  }

  const content = await readTextFile(filePath, {
    baseDir: BaseDirectory.AppData,
  });

  return JSON.parse(content) as UserSettings;
}

// Create a new project
export async function createProject(
  projectName: string,
  projectType: ProjectType | ""
) {
  const projectPath = `${BASE_DIR}/${projectName}`;
  const metadataPath = `${projectPath}/metadata.json`;

  // Create project folder
  await mkdir(projectPath, { baseDir: BaseDirectory.AppData });

  // Initialize metadata for the project
  const metadata: ProjectMetadata = {
    projectName,
    projectType: projectType, // Include projectType
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
      const {
        projectName,
        createDate,
        lastModified,
        wordCount,
        lastBackedUp,
        projectType,
      } = JSON.parse(content);
      return {
        projectName,
        createDate,
        lastModified,
        wordCount,
        lastBackedUp,
        projectType,
      };
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

// Helper function to get current timestamp
export function getCurrentTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.-]/g, "").slice(0, 15);
}

// Recursive function to copy files and directories
export async function copyDirectoryContents(
  sourcePath: string,
  destinationPath: string
) {
  const entries = await readDir(sourcePath, { baseDir: BaseDirectory.AppData });

  for (const entry of entries) {
    const sourceEntryPath = await join(sourcePath, entry.name);
    const destinationEntryPath = await join(destinationPath, entry.name);

    if (entry.isDirectory) {
      await mkdir(destinationEntryPath, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });
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
  const backupDirPath = `${BACKUP_DIR}`;
  const timestamp = getCurrentTimestamp();
  const newBackupPath = `${backupDirPath}/${projectName}_${timestamp}`;

  // Ensure the backup directory exists
  await mkdir(backupDirPath, {
    baseDir: BaseDirectory.Document,
    recursive: true,
  });

  // Get existing backups for this project
  const entries = await readDir(backupDirPath, {
    baseDir: BaseDirectory.Document,
  });
  const projectBackups = entries.filter(
    (entry) => entry.name.startsWith(`${projectName}_`) && entry.isDirectory
  );

  // Sort backups by timestamp (ascending order)
  projectBackups.sort((a, b) => a.name.localeCompare(b.name));

  // Delete the oldest backup if there are already 5 backups
  if (projectBackups.length >= 5) {
    const oldestBackup = projectBackups[0];
    await remove(`${backupDirPath}/${oldestBackup.name}`, {
      baseDir: BaseDirectory.Document,
      recursive: true,
    });
  }

  // Create a new backup directory with the timestamp
  await mkdir(newBackupPath, {
    baseDir: BaseDirectory.Document,
    recursive: true,
  });

  // Copy the contents of the project directory to the new backup directory
  await copyDirectoryContents(projectPath, newBackupPath);
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
