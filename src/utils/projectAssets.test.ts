import { invoke } from "@tauri-apps/api/core";
import {
  cleanupProjectAssets,
  importProjectAsset,
  listProjectAssets,
  removeProjectAsset,
  replaceProjectAsset,
} from "./projectAssets";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }));

describe("project asset commands", () => {
  beforeEach(() => jest.clearAllMocks());

  test("uses project-scoped native commands and camel-case arguments", async () => {
    (invoke as jest.Mock).mockResolvedValue([]);
    await listProjectAssets("My Book");
    await importProjectAsset("My Book", "C:\\incoming\\map.png");
    await replaceProjectAsset("My Book", "asset-1", "C:\\incoming\\new.png");
    await removeProjectAsset("My Book", "asset-1");
    await cleanupProjectAssets("My Book");

    expect((invoke as jest.Mock).mock.calls).toEqual([
      ["list_project_assets", { projectName: "My Book" }],
      ["import_project_asset", { projectName: "My Book", sourcePath: "C:\\incoming\\map.png" }],
      ["replace_project_asset", { projectName: "My Book", assetId: "asset-1", sourcePath: "C:\\incoming\\new.png" }],
      ["remove_project_asset", { projectName: "My Book", assetId: "asset-1" }],
      ["cleanup_project_assets", { projectName: "My Book" }],
    ]);
  });
});
