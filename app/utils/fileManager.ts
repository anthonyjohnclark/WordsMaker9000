import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  BaseDirectory,
  remove,
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
  projectName: string;
  treeData: [];
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
  const metadata: ProjectMetadata = { projectName: projectName, treeData: [] };
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
  fileId: string
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
  fileId: string,
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

// Add an item (file/folder) to the project
export async function addItemToProject(
  projectName: string,
  item: FileMetadata
) {
  const metadata = await readMetadata(decodeURIComponent(projectName));

  // Add the new item to metadata.files
  metadata.files[item.id] = item;

  // Add to the appropriate parent or root order
  if (item.parent && metadata.files[item.parent]) {
    const parent = metadata.files[item.parent];
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(item.id);
  } else {
    metadata.rootOrder.push(item.id);
  }

  // If the item is a file, create a separate JSON file for its content
  if (item.type === "file") {
    const filePath = `${BASE_DIR}/${decodeURIComponent(projectName)}/${
      item.id
    }.json`;
    try {
      const fileData = JSON.stringify({ content: "" }); // Initialize with empty content
      await writeTextFile(filePath, fileData, {
        baseDir: BaseDirectory.AppData,
      });
    } catch (err) {
      console.error(`Error creating file content: ${filePath}`, err);
      throw err;
    }
  }

  // Update the metadata file
  await updateMetadata(decodeURIComponent(projectName), metadata);
}

// Delete an item (file/folder) from the project
export async function deleteFile(projectName: string, fileId: string) {
  const metadata = await readMetadata(projectName);

  const file = metadata.treeData.find((item) => item.id === fileId);

  // Ensure the item exists
  if (!file) {
    throw new Error(`Item with ID ${fileId} does not exist.`);
  }

  const filePath = `${BASE_DIR}/${decodeURIComponent(projectName)}/${
    file.fileId
  }.json`;

  try {
    await remove(filePath, { baseDir: BaseDirectory.AppData });
    console.log(`File ${filePath} deleted successfully.`);
  } catch (error) {
    console.error(`Failed to delete file: ${error.message}`);
    throw new Error("Failed to delete the file.");
  }
}
