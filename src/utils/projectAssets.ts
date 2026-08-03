import { invoke } from "@tauri-apps/api/core";
import { ProjectAsset } from "../types/ProjectAssetTypes";

export const listProjectAssets = (projectName: string): Promise<ProjectAsset[]> =>
  invoke("list_project_assets", { projectName });

export const importProjectAsset = (
  projectName: string,
  sourcePath: string,
): Promise<ProjectAsset> =>
  invoke("import_project_asset", { projectName, sourcePath });

export const replaceProjectAsset = (
  projectName: string,
  assetId: string,
  sourcePath: string,
): Promise<ProjectAsset> =>
  invoke("replace_project_asset", { projectName, assetId, sourcePath });

export const removeProjectAsset = (
  projectName: string,
  assetId: string,
): Promise<void> => invoke("remove_project_asset", { projectName, assetId });

export const cleanupProjectAssets = (projectName: string): Promise<string[]> =>
  invoke("cleanup_project_assets", { projectName });
