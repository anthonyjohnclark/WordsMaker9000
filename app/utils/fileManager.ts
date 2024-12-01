import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

const BASE_DIR = "Projects";

interface FileMetadata {
  id: string;
  title: string;
  type: "file" | "folder";
  parent: string | null;
  children?: string[];
  content?: string; // Only applicable for files
}

interface ProjectMetadata {
  rootOrder: string[];
  files: Record<string, FileMetadata>;
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
  const metadata: ProjectMetadata = { rootOrder: [], files: {} };
  await writeTextFile(metadataPath, JSON.stringify(metadata), {
    baseDir: BaseDirectory.AppData,
  });

  return projectPath;
}

// List all projects
export async function listProjects() {
  const projects = await readDir(BASE_DIR, { baseDir: BaseDirectory.AppData });
  return projects.map((project) => project.name);
}

// Read metadata for a project
export async function readMetadata(
  projectName: string
): Promise<ProjectMetadata> {
  const metadataPath = `${BASE_DIR}/${projectName}/metadata.json`;
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

export async function reorderItemsInParent(
  projectName: string,
  parentId: string | null,
  orderedIds: string[]
) {
  const metadata = await readMetadata(projectName);

  if (parentId) {
    const parent = metadata.files[parentId];
    if (parent && parent.children) {
      parent.children = orderedIds;
    }
  } else {
    metadata.rootOrder = orderedIds;
  }

  await updateMetadata(projectName, metadata);
}

// Write metadata for a project
export async function updateMetadata(
  projectName: string,
  metadata: ProjectMetadata
) {
  const metadataPath = `${BASE_DIR}/${projectName}/metadata.json`;
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
export async function readFileFromMetadata(
  projectName: string,
  fileId: string
): Promise<string> {
  const metadata = await readMetadata(projectName);
  const file = metadata.files[fileId];
  if (!file || file.type !== "file") {
    throw new Error(`File with ID ${fileId} not found or is not a file.`);
  }
  const filePath = `${BASE_DIR}/${projectName}/${fileId}.json`;
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
export async function saveFileToMetadata(
  projectName: string,
  fileId: string,
  content: string
) {
  const metadata = await readMetadata(projectName);
  const file = metadata.files[fileId];
  if (!file || file.type !== "file") {
    throw new Error(`File with ID ${fileId} not found or is not a file.`);
  }
  const filePath = `${BASE_DIR}/${projectName}/${fileId}.json`;
  try {
    const fileData = JSON.stringify({ content }); // Save content in a JSON structure
    await writeTextFile(filePath, fileData, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.error(`Error saving file content: ${filePath}`, err);
    throw err;
  }
}

// Add an item (file/folder) to the project
export async function addItemToProject(
  projectName: string,
  item: FileMetadata
) {
  const metadata = await readMetadata(projectName);

  metadata.files[item.id] = item;

  // Add to the appropriate parent or root order
  if (item.parent) {
    const parent = metadata.files[item.parent];
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(item.id);
  } else {
    metadata.rootOrder.push(item.id);
  }

  await updateMetadata(projectName, metadata);
}

// Delete an item (file/folder) from the project
export async function deleteItemFromMetadata(
  projectName: string,
  itemId: string
) {
  const metadata = await readMetadata(projectName);

  // Ensure the item exists
  if (!metadata.files[itemId]) {
    throw new Error(`Item with ID ${itemId} does not exist.`);
  }

  const item = metadata.files[itemId];

  // Remove from its parent's children or root order
  if (item.parent) {
    const parent = metadata.files[item.parent];
    if (parent && parent.children) {
      parent.children = parent.children.filter(
        (childId: string) => childId !== itemId
      );
    }
  } else {
    metadata.rootOrder = metadata.rootOrder.filter(
      (id: string) => id !== itemId
    );
  }

  // Recursively delete children if the item is a folder
  if (item.type === "folder" && item.children) {
    for (const childId of item.children) {
      await deleteItemFromMetadata(projectName, childId);
    }
  }

  // Remove the item itself
  delete metadata.files[itemId];

  await updateMetadata(projectName, metadata);
}
