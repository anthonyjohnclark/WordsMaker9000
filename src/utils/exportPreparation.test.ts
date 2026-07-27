import { ExtendedNodeModel } from "../types/ProjectPageTypes";
import { ExportOptions, ExportPayload } from "../types/ExportTypes";
import { prepareAndExportProject } from "./exportPreparation";

const options: ExportOptions = {
  title: "Test Book",
  author: "Test Author",
};

const makeNode = ({
  id,
  parent,
  text,
  fileType,
  fileId,
}: {
  id: number;
  parent: number;
  text: string;
  fileType: "file" | "folder" | undefined;
  fileId?: string;
}): ExtendedNodeModel => ({
  id,
  parent,
  text,
  droppable: fileType === "folder",
  data: {
    fileType,
    fileName: text,
    fileId: fileId ?? "",
    wordCount: 0,
    lastModified: new Date(0),
    createDate: new Date(0),
  },
});

describe("prepareAndExportProject", () => {
  it("flushes the current buffer before reading and exports the flushed content", async () => {
    const calls: string[] = [];
    const disk = new Map([["file-1", "<p>Saved content</p>"]]);
    let exportedPayload: ExportPayload | undefined;
    const flushCurrentDocument = jest.fn(async () => {
      calls.push("flush:start");
      await Promise.resolve();
      disk.set("file-1", "<p>Unsaved content</p>");
      calls.push("flush:end");
    });
    const readFile = jest.fn(async (projectName: string, fileId: string) => {
      calls.push(`read:${projectName}:${fileId}`);
      return disk.get(fileId) ?? "";
    });
    const exportProject = jest.fn(async (payload: ExportPayload) => {
      calls.push("export");
      exportedPayload = payload;
      return { success: true };
    });

    await prepareAndExportProject(
      {
        projectName: "My%20Book",
        treeData: [
          makeNode({
            id: 1,
            parent: 0,
            text: "Scene",
            fileType: "file",
            fileId: "file-1",
          }),
        ],
        options,
        flushCurrentDocument,
      },
      { readFile, exportProject },
    );

    expect(calls).toEqual([
      "flush:start",
      "flush:end",
      "read:My%20Book:file-1",
      "export",
    ]);
    expect(exportedPayload?.project_name).toBe("My Book");
    expect(exportedPayload?.nodes[0].content).toBe(
      "<p>Unsaved content</p>",
    );
  });

  it("retains tree array order and reads only file nodes", async () => {
    const treeData = [
      makeNode({
        id: 1,
        parent: 0,
        text: "Opening",
        fileType: "file",
        fileId: "opening",
      }),
      makeNode({
        id: 2,
        parent: 0,
        text: "Act",
        fileType: "folder",
      }),
      makeNode({
        id: 3,
        parent: 2,
        text: "Inside",
        fileType: "file",
        fileId: "inside",
      }),
      makeNode({
        id: 4,
        parent: 0,
        text: "Closing",
        fileType: "file",
        fileId: "closing",
      }),
    ];
    const readFile = jest.fn(async (_projectName: string, fileId: string) => {
      return `<p>${fileId}</p>`;
    });
    const exportProject = jest.fn(async (payload: ExportPayload) => ({
      success: true,
      output_path: payload.nodes.map((node) => node.id).join(","),
    }));

    const result = await prepareAndExportProject(
      {
        projectName: "Book",
        treeData,
        options,
        flushCurrentDocument: jest.fn(async () => undefined),
      },
      { readFile, exportProject },
    );

    expect(result.output_path).toBe("1,2,3,4");
    expect(readFile.mock.calls.map((call) => call[1])).toEqual([
      "opening",
      "inside",
      "closing",
    ]);
    expect(exportProject.mock.calls[0][0].nodes[1]).toEqual({
      id: 2,
      parent: 0,
      text: "Act",
      file_type: "folder",
    });
  });

  it("does not read or export when the editor flush fails", async () => {
    const readFile = jest.fn(async () => "");
    const exportProject = jest.fn(async () => ({ success: true }));

    await expect(
      prepareAndExportProject(
        {
          projectName: "Book",
          treeData: [
            makeNode({
              id: 7,
              parent: 0,
              text: "Scene",
              fileType: "file",
              fileId: "scene",
            }),
          ],
          options,
          flushCurrentDocument: jest.fn(async () => {
            throw new Error("disk full");
          }),
        },
        { readFile, exportProject },
      ),
    ).rejects.toThrow("disk full");

    expect(readFile).not.toHaveBeenCalled();
    expect(exportProject).not.toHaveBeenCalled();
  });

  it("blocks a file with no source ID and identifies the node", async () => {
    const readFile = jest.fn(async () => "");
    const exportProject = jest.fn(async () => ({ success: true }));

    await expect(
      prepareAndExportProject(
        {
          projectName: "Book",
          treeData: [
            makeNode({
              id: 9,
              parent: 0,
              text: "Missing Source",
              fileType: "file",
            }),
          ],
          options,
          flushCurrentDocument: jest.fn(async () => undefined),
        },
        { readFile, exportProject },
      ),
    ).rejects.toThrow('Cannot export "Missing Source" (node 9): missing file ID');

    expect(readFile).not.toHaveBeenCalled();
    expect(exportProject).not.toHaveBeenCalled();
  });

  it("blocks a read failure, identifies the node, and never invokes the exporter", async () => {
    const readFile = jest.fn(async () => {
      throw new Error("permission denied");
    });
    const exportProject = jest.fn(async () => ({ success: true }));

    await expect(
      prepareAndExportProject(
        {
          projectName: "Book",
          treeData: [
            makeNode({
              id: 11,
              parent: 0,
              text: "Unreadable Scene",
              fileType: "file",
              fileId: "unreadable",
            }),
          ],
          options,
          flushCurrentDocument: jest.fn(async () => undefined),
        },
        { readFile, exportProject },
      ),
    ).rejects.toThrow(
      'Failed to read "Unreadable Scene" (node 11) for export: permission denied',
    );

    expect(exportProject).not.toHaveBeenCalled();
  });
});
