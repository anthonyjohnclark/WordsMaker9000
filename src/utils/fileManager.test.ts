import {
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  remove,
  copyFile,
  exists,
} from "@tauri-apps/plugin-fs";

import {
  saveSettings,
  retrieveSettings,
  createProject,
  deleteProject,
  listProjectsSummary,
  listProjectsWithMetadata,
  fetchFullMetadata,
  backupProject,
  updateMetadata,
  readFile,
  saveFile,
  deleteFile,
  copyDirectoryContents,
  getCurrentTimestamp,
  restoreProjectFromBackup,
  UserSettings,
} from "./fileManager";

jest.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: jest.fn(),
  writeTextFile: jest.fn(),
  mkdir: jest.fn(),
  readDir: jest.fn(),
  remove: jest.fn(),
  copyFile: jest.fn(),
  exists: jest.fn(),
  BaseDirectory: {
    AppData: "AppData",
    Document: "Document",
  },
}));

jest.mock("path-browserify", () => ({
  join: (...args: string[]) => args.join("/"),
}));

const defaultSettings: UserSettings = {
  defaultFontZoom: 16,
  defaultSaveInterval: 60000, // 1 minute
  defaultBackupInterval: 3600000, // 1 hour
  aiSuiteEnabled: false,
};

describe("fileManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("saveSettings", () => {
    it("should create the user directory and write settings file", async () => {
      const testSettings = {
        defaultFontZoom: 18,
        defaultSaveInterval: 10000,
        defaultBackupInterval: 5000,
        aiSuiteEnabled: true,
      };
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (writeTextFile as jest.Mock).mockResolvedValue(undefined);

      await saveSettings(testSettings);
      expect(mkdir).toHaveBeenCalledWith("User", {
        baseDir: expect.any(String),
        recursive: true,
      });
      expect(writeTextFile).toHaveBeenCalledWith(
        "User/settings.json",
        JSON.stringify(testSettings),
        { baseDir: expect.any(String) }
      );
    });
  });

  describe("retrieveSettings", () => {
    it("should save and return default settings if file does not exist", async () => {
      (exists as jest.Mock).mockResolvedValue(false);
      (writeTextFile as jest.Mock).mockResolvedValue(undefined);
      (readTextFile as jest.Mock).mockResolvedValue(
        JSON.stringify(defaultSettings)
      );

      const settings = await retrieveSettings();
      expect(exists).toHaveBeenCalled();
      expect(writeTextFile).toHaveBeenCalled(); // saveSettings called internally
      expect(settings).toEqual(defaultSettings);
    });

    it("should return existing settings if file exists", async () => {
      const customSettings = {
        defaultFontZoom: 20,
        defaultSaveInterval: 20000,
        defaultBackupInterval: 10000,
        aiSuiteEnabled: false,
      };
      (exists as jest.Mock).mockResolvedValue(true);
      (readTextFile as jest.Mock).mockResolvedValue(
        JSON.stringify(customSettings)
      );

      const settings = await retrieveSettings();
      expect(exists).toHaveBeenCalled();
      expect(readTextFile).toHaveBeenCalled();
      expect(settings).toEqual(customSettings);
    });
  });

  describe("createProject", () => {
    it("should create a project folder and write metadata file", async () => {
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (writeTextFile as jest.Mock).mockResolvedValue(undefined);

      const projectPath = await createProject("TestProject", "novel");
      expect(mkdir).toHaveBeenCalledWith("Projects/TestProject", {
        baseDir: expect.any(String),
      });
      expect(writeTextFile).toHaveBeenCalled();
      expect(projectPath).toBe("Projects/TestProject");
    });
  });

  describe("deleteProject", () => {
    it("should remove the project directory", async () => {
      (remove as jest.Mock).mockResolvedValue(undefined);
      await deleteProject("TestProject");
      expect(remove).toHaveBeenCalledWith("Projects/TestProject", {
        baseDir: expect.any(String),
        recursive: true,
      });
    });
  });

  describe("listProjectsSummary", () => {
    it("should return an array of project summaries", async () => {
      const fakeProjects = [{ name: "Project1" }, { name: "Project2" }];
      (readDir as jest.Mock).mockResolvedValue(fakeProjects);
      const metadata1 = {
        projectName: "Project1",
        createDate: "2025-01-01T00:00:00.000Z",
        lastModified: "2025-01-02T00:00:00.000Z",
        wordCount: 100,
        lastBackedUp: "2025-01-03T00:00:00.000Z",
        projectType: "novel",
      };
      const metadata2 = {
        projectName: "Project2",
        createDate: "2025-02-01T00:00:00.000Z",
        lastModified: "2025-02-02T00:00:00.000Z",
        wordCount: 200,
        lastBackedUp: "2025-02-03T00:00:00.000Z",
        projectType: "novella",
      };
      (readTextFile as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(metadata1))
        .mockResolvedValueOnce(JSON.stringify(metadata2));

      const summaries = await listProjectsSummary();
      expect(summaries.length).toBe(2);
      expect(summaries[0]).toEqual(metadata1);
      expect(summaries[1]).toEqual(metadata2);
    });
  });

  describe("listProjectsWithMetadata", () => {
    it("should return an array of projects with metadata", async () => {
      const fakeProjects = [{ name: "Project1" }];
      (readDir as jest.Mock).mockResolvedValue(fakeProjects);
      const metadata = {
        projectName: "Project1",
        createDate: "2025-01-01T00:00:00.000Z",
        lastModified: null,
        wordCount: 0,
        lastBackedUp: null,
        projectType: "",
        treeData: [],
      };
      (readTextFile as jest.Mock).mockResolvedValue(JSON.stringify(metadata));

      const projects = await listProjectsWithMetadata();
      expect(projects.length).toBe(1);
      expect(projects[0]).toEqual(metadata);
    });
  });

  describe("fetchFullMetadata", () => {
    it("should return full metadata for a project", async () => {
      const metadata = {
        projectName: "Project1",
        createDate: "2025-01-01T00:00:00.000Z",
        lastModified: null,
        wordCount: 0,
        lastBackedUp: null,
        projectType: "",
        treeData: [],
      };
      (readTextFile as jest.Mock).mockResolvedValue(JSON.stringify(metadata));

      const result = await fetchFullMetadata("Project1");
      expect(result).toEqual(metadata);
    });
  });

  describe("updateMetadata", () => {
    it("should merge new metadata with existing metadata and write it", async () => {
      const originalMetadata = {
        projectName: "Project1",
        createDate: "2025-01-01T00:00:00.000Z",
        lastModified: null,
        wordCount: 0,
        lastBackedUp: null,
        projectType: "",
        treeData: [],
      };
      (readTextFile as jest.Mock).mockResolvedValue(
        JSON.stringify(originalMetadata)
      );
      (writeTextFile as jest.Mock).mockResolvedValue(undefined);

      await updateMetadata("Project1", { wordCount: 150 });
      const updatedMetadata = { ...originalMetadata, wordCount: 150 };
      expect(writeTextFile).toHaveBeenCalledWith(
        "Projects/Project1/metadata.json",
        JSON.stringify(updatedMetadata),
        { baseDir: expect.any(String) }
      );
    });

    it("should throw error if fetching existing metadata fails", async () => {
      (readTextFile as jest.Mock).mockRejectedValue(new Error("fetch error"));
      await expect(
        updateMetadata("Project1", { wordCount: 200 })
      ).rejects.toThrow("fetch error");
    });
  });

  describe("readFile and saveFile", () => {
    it("should read file content and return the content field", async () => {
      const fileData = { content: "Hello World" };
      (readTextFile as jest.Mock).mockResolvedValue(JSON.stringify(fileData));

      const content = await readFile("Project1", "file1");
      expect(content).toBe("Hello World");
    });

    it("should return empty string if content key is missing", async () => {
      (readTextFile as jest.Mock).mockResolvedValue(JSON.stringify({}));
      const content = await readFile("Project1", "file1");
      expect(content).toBe("");
    });

    it("should save file content correctly", async () => {
      (writeTextFile as jest.Mock).mockResolvedValue(undefined);
      await saveFile("Project1", "file1", "New Content");
      expect(writeTextFile).toHaveBeenCalledWith(
        "Projects/Project1/file1.json",
        JSON.stringify({ content: "New Content" }),
        { baseDir: expect.any(String) }
      );
    });
  });

  describe("deleteFile", () => {
    it("should remove the specified file", async () => {
      (remove as jest.Mock).mockResolvedValue(undefined);
      await deleteFile("Project1", "file1");
      expect(remove).toHaveBeenCalledWith("Projects/Project1/file1.json", {
        baseDir: expect.any(String),
      });
    });
  });

  describe("backupProject", () => {
    it("should backup a project and remove the oldest backup if the limit is exceeded", async () => {
      const fakeBackups = [
        { name: "TestProject_202501010000000", isDirectory: true },
        { name: "TestProject_202501020000000", isDirectory: true },
        { name: "TestProject_202501030000000", isDirectory: true },
        { name: "TestProject_202501040000000", isDirectory: true },
        { name: "TestProject_202501050000000", isDirectory: true },
      ];
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (readDir as jest.Mock).mockImplementation((dir: string) => {
        if (dir === "WordsMaker3000Backups") {
          return Promise.resolve(fakeBackups);
        }
        return Promise.resolve([]);
      });

      await backupProject("TestProject");

      expect(remove).toHaveBeenCalledWith(
        "WordsMaker3000Backups/TestProject_202501010000000",
        { baseDir: expect.any(String), recursive: true }
      );
      expect(mkdir).toHaveBeenCalled();
    });

    it("should not remove backups if fewer than 5 exist", async () => {
      const fakeBackups = [
        { name: "TestProject_202501010000000", isDirectory: true },
        { name: "TestProject_202501020000000", isDirectory: true },
        { name: "TestProject_202501030000000", isDirectory: true },
      ];
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (readDir as jest.Mock).mockImplementation((dir: string) => {
        if (dir === "WordsMaker3000Backups") {
          return Promise.resolve(fakeBackups);
        }
        return Promise.resolve([]);
      });

      await backupProject("TestProject");

      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe("copyDirectoryContents", () => {
    it("should recursively copy directories and files", async () => {
      (readDir as jest.Mock).mockImplementation((dir: string) => {
        if (dir === "sourceDir") {
          return Promise.resolve([
            { name: "file1.txt", isDirectory: false },
            { name: "subdir", isDirectory: true },
          ]);
        } else if (dir === "sourceDir/subdir") {
          return Promise.resolve([{ name: "file2.txt", isDirectory: false }]);
        }
        return Promise.resolve([]);
      });
      await copyDirectoryContents("sourceDir", "destDir");
      expect(mkdir).toHaveBeenCalledWith("destDir/subdir", {
        baseDir: expect.any(String),
        recursive: true,
      });
      expect(copyFile).toHaveBeenCalledWith(
        "sourceDir/file1.txt",
        "destDir/file1.txt",
        {
          fromPathBaseDir: "AppData",
          toPathBaseDir: "Document",
        }
      );

      expect(copyFile).toHaveBeenCalledWith(
        "sourceDir/subdir/file2.txt",
        "destDir/subdir/file2.txt",
        {
          fromPathBaseDir: "AppData",
          toPathBaseDir: "Document",
        }
      );
    });

    it("should handle copyFile errors gracefully", async () => {
      (readDir as jest.Mock).mockImplementation((dir: string) => {
        if (dir === "sourceDir") {
          return Promise.resolve([{ name: "subdir", isDirectory: true }]);
        } else if (dir === "sourceDir/subdir") {
          return Promise.resolve([{ name: "file2.txt", isDirectory: false }]);
        }
        return Promise.resolve([]);
      });
      (copyFile as jest.Mock).mockRejectedValueOnce(new Error("copy error"));
      await expect(
        copyDirectoryContents("sourceDir", "destDir")
      ).rejects.toThrow("copy error");
    });
  });

  describe("getCurrentTimestamp", () => {
    it("should return a consistent formatted timestamp", () => {
      const fixedDate = new Date("2025-01-01T00:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => fixedDate as any);
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toMatch(/^\d{8}T\d{6}$/); // e.g., "20250101T000000"
      jest.restoreAllMocks();
    });
  });

  describe("deleteProject with encoded name", () => {
    it("should decode encoded project names safely", async () => {
      (remove as jest.Mock).mockResolvedValue(undefined);
      await deleteProject("My%20Project");
      expect(remove).toHaveBeenCalledWith("Projects/My Project", {
        baseDir: expect.any(String),
        recursive: true,
      });
    });
  });

  describe("Error Handling", () => {
    it("saveSettings should log error when mkdir fails", async () => {
      (mkdir as jest.Mock).mockRejectedValue(new Error("mkdir error"));
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await saveSettings(defaultSettings);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("retrieveSettings should throw if settings file is unreadable", async () => {
      (exists as jest.Mock).mockResolvedValue(true);
      (readTextFile as jest.Mock).mockRejectedValue(new Error("read error"));
      await expect(retrieveSettings()).rejects.toThrow("read error");
    });
  });

  describe("restoreProjectFromBackup", () => {
    it("should remove project directory, recreate it, and copy backup contents", async () => {
      const projectName = "TestProject";
      const backupFolderName = "TestProject_backup";

      (remove as jest.Mock).mockResolvedValue(undefined);
      (mkdir as jest.Mock).mockResolvedValue(undefined);

      // Mock readDir to return an array with one file to simulate actual copyDirectoryContents behavior
      const readDirMock = require("@tauri-apps/plugin-fs").readDir as jest.Mock;
      readDirMock.mockResolvedValue([
        { name: "file1.txt", isDirectory: false },
      ]);

      // Mock mkdir and copyFile to simulate copyDirectoryContents behavior
      const mkdirMock = require("@tauri-apps/plugin-fs").mkdir as jest.Mock;
      const copyFileMock = require("@tauri-apps/plugin-fs")
        .copyFile as jest.Mock;
      mkdirMock.mockResolvedValue(undefined);
      copyFileMock.mockResolvedValue(undefined);

      await restoreProjectFromBackup(projectName, backupFolderName);

      expect(remove).toHaveBeenCalledWith(`Projects/${projectName}`, {
        baseDir: "AppData",
        recursive: true,
      });

      expect(mkdir).toHaveBeenCalledWith(`Projects/${projectName}`, {
        baseDir: "AppData",
        recursive: true,
      });

      expect(mkdirMock).toHaveBeenCalledWith(`Projects/${projectName}`, {
        baseDir: "AppData",
        recursive: true,
      });

      expect(copyFileMock).toHaveBeenCalledWith(
        `WordsMaker3000Backups/${backupFolderName}/file1.txt`,
        `Projects/${projectName}/file1.txt`,
        { fromPathBaseDir: "Document", toPathBaseDir: "AppData" }
      );

      readDirMock.mockRestore();
      mkdirMock.mockRestore();
      copyFileMock.mockRestore();
    });
  });
});
