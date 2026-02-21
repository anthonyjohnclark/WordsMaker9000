import { invoke } from "@tauri-apps/api/core";
import { ExportPayload, ExportResult } from "../types/ExportTypes";

export const exportProject = async (
  payload: ExportPayload
): Promise<ExportResult> => {
  try {
    const response = await invoke<ExportResult>("export_project", {
      payload,
    });
    return response;
  } catch (error) {
    console.error("Error in exportProject function:", error);
    throw new Error("Failed to export project");
  }
};
