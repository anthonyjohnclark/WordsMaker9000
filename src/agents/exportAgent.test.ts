import { invoke } from "@tauri-apps/api/core";
import { ExportPayload } from "../types/ExportTypes";
import { exportProject } from "./exportAgent";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

const payload: ExportPayload = {
  project_name: "Book",
  nodes: [],
  options: {
    title: "Book",
    author: "Author",
  },
};

describe("exportProject", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("returns the native export result", async () => {
    (invoke as jest.Mock).mockResolvedValue({
      success: true,
      output_path: "book.pdf",
    });

    await expect(exportProject(payload)).resolves.toEqual({
      success: true,
      output_path: "book.pdf",
    });
  });

  it("preserves native validation errors", async () => {
    (invoke as jest.Mock).mockRejectedValue(
      'Project node "Orphan" (ID 4) has missing parent 99',
    );

    await expect(exportProject(payload)).rejects.toThrow(
      'Project node "Orphan" (ID 4) has missing parent 99',
    );
  });
});
