import { ExtendedNodeModel } from "../types/ProjectPageTypes";
import {
  ExportFileNode,
  ExportOptions,
  ExportPayload,
  ExportProgress,
  ExportResult,
} from "../types/ExportTypes";

type ReadProjectFile = (
  projectName: string,
  fileId: string,
) => Promise<string>;

type InvokeExporter = (payload: ExportPayload) => Promise<ExportResult>;

export interface ExportPreparationDependencies {
  readFile: ReadProjectFile;
  exportProject: InvokeExporter;
}

export interface PrepareAndExportProjectInput {
  projectName: string;
  treeData: ExtendedNodeModel[];
  options: ExportOptions;
  flushCurrentDocument: () => Promise<void>;
  onProgress?: (progress: ExportProgress) => void;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const prepareAndExportProject = async (
  input: PrepareAndExportProjectInput,
  dependencies: ExportPreparationDependencies,
): Promise<ExportResult> => {
  const { onProgress } = input;
  const fileCount = input.treeData.filter(
    (node) => node.data?.fileType === "file",
  ).length;

  onProgress?.({
    stage: "Saving current document...",
    current: 0,
    total: Math.max(fileCount, 1),
  });
  await input.flushCurrentDocument();

  const nodes: ExportFileNode[] = [];
  let fileNumber = 0;

  for (const node of input.treeData) {
    const fileType = node.data?.fileType;
    if (fileType !== "file" && fileType !== "folder") {
      throw new Error(
        `Cannot export "${node.text}" (node ${node.id}): missing file type`,
      );
    }

    const exportNode: ExportFileNode = {
      id: node.id as number,
      parent: node.parent as number,
      text: node.text,
      file_type: fileType,
    };

    if (fileType === "file") {
      const fileId = node.data?.fileId;
      if (!fileId) {
        throw new Error(
          `Cannot export "${node.text}" (node ${node.id}): missing file ID`,
        );
      }

      fileNumber += 1;
      onProgress?.({
        stage: `Reading file ${fileNumber} of ${fileCount}...`,
        current: fileNumber - 1,
        total: fileCount,
      });

      try {
        exportNode.content = await dependencies.readFile(
          input.projectName,
          fileId,
        );
      } catch (error) {
        throw new Error(
          `Failed to read "${node.text}" (node ${node.id}) for export: ${errorMessage(
            error,
          )}`,
        );
      }
    }

    nodes.push(exportNode);
  }

  const payload: ExportPayload = {
    project_name: decodeURIComponent(input.projectName),
    nodes,
    options: input.options,
  };

  onProgress?.({
    stage: "Compiling document...",
    current: 0,
    total: 1,
  });
  return dependencies.exportProject(payload);
};
