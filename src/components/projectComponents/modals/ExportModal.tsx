import { useState, useEffect, useRef } from "react";
import {
  FiDownload,
  FiCheckCircle,
  FiAlertCircle,
  FiExternalLink,
} from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { useModal } from "../../../contexts/global/ModalContext";
import { useErrorContext } from "../../../contexts/global/ErrorContext";
import { exportProject } from "../../../agents/exportAgent";
import { readFile } from "../../../utils/fileManager";
import { prepareAndExportProject } from "../../../utils/exportPreparation";
import { ExportResult, ExportProgress } from "../../../types/ExportTypes";

export const ExportModal = () => {
  const project = useProjectContext();
  const modal = useModal();
  const { showError } = useErrorContext();

  const [title, setTitle] = useState<string>(
    project.projectMetadata.projectName || "",
  );
  const [author, setAuthor] = useState<string>("");
  const [frontMatter, setFrontMatter] = useState<string>("");
  const [backMatter, setBackMatter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  const handleExport = async () => {
    setIsLoading(true);
    setResult(null);
    setProgress({ stage: "Saving current document...", current: 0, total: 1 });

    try {
      unlistenRef.current = await listen<ExportProgress>(
        "export-progress",
        (event) => {
          setProgress(event.payload);
        },
      );

      const exportResult = await prepareAndExportProject(
        {
          projectName: project.projectName,
          treeData: project.treeData,
          flushCurrentDocument: project.flushCurrentDocument,
          onProgress: setProgress,
          options: {
            title: title.trim() || "Untitled",
            author: author.trim() || "Unknown Author",
            front_matter: frontMatter.trim() || undefined,
            back_matter: backMatter.trim() || undefined,
          },
        },
        {
          readFile,
          exportProject,
        },
      );

      setResult(exportResult);
    } catch (error) {
      showError(error, "exporting project");
      setResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleOpenPdf = async () => {
    if (result?.output_path) {
      try {
        await invoke("open_file_default", { path: result.output_path });
      } catch (error) {
        console.error("Failed to open PDF:", error);
      }
    }
  };

  // Success state
  if (result?.success) {
    return (
      <div className="flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiCheckCircle style={{ color: "var(--btn-success)" }} />
          Export Complete
        </h2>
        <div className="flex justify-end gap-4">
          <button
            onClick={() => modal.handleClose()}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Done
          </button>
          <button
            onClick={handleOpenPdf}
            className="px-4 py-2 rounded flex items-center gap-2"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            <FiExternalLink />
            Open PDF
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (result && !result.success) {
    return (
      <div className="flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiAlertCircle style={{ color: "var(--btn-danger, #ef4444)" }} />
          Export Failed
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {result.error || "An unknown error occurred."}
        </p>
        <div className="flex justify-end gap-4">
          <button
            onClick={() => modal.handleClose()}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setResult(null)}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Loading state with progress bar
  if (isLoading) {
    const percent =
      progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;
    return (
      <div className="flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiDownload style={{ color: "var(--btn-primary)" }} />
          Exporting...
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {progress?.stage || "Preparing..."}
        </p>
        <div
          className="w-full rounded-full h-3 overflow-hidden"
          style={{ background: "var(--bg-input)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${percent}%`,
              background: "var(--btn-primary)",
              minWidth: percent > 0 ? "0.75rem" : "0",
            }}
          />
        </div>
        <p
          className="text-xs text-right"
          style={{ color: "var(--text-muted, #888)" }}
        >
          {percent}%
        </p>
      </div>
    );
  }

  // Default form state
  return (
    <div className="flex flex-col gap-4">
      <h2
        className="text-lg font-bold flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <FiDownload style={{ color: "var(--btn-primary)" }} />
        Export to PDF
      </h2>

      {/* Title */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="border rounded w-full p-2 focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          placeholder="Book title"
        />
      </div>

      {/* Author */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Author
        </label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="border rounded w-full p-2 focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          placeholder="Author name"
        />
      </div>

      {/* Front Matter */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Front Matter{" "}
          <span style={{ color: "var(--text-muted, #888)" }}>(optional)</span>
        </label>
        <textarea
          value={frontMatter}
          onChange={(e) => setFrontMatter(e.target.value)}
          rows={3}
          className="border rounded w-full p-2 focus:outline-none resize-y"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          placeholder="Dedication, foreword, etc."
        />
      </div>

      {/* Back Matter */}
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Back Matter{" "}
          <span style={{ color: "var(--text-muted, #888)" }}>(optional)</span>
        </label>
        <textarea
          value={backMatter}
          onChange={(e) => setBackMatter(e.target.value)}
          rows={3}
          className="border rounded w-full p-2 focus:outline-none resize-y"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          placeholder="Acknowledgments, about the author, etc."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 mt-2">
        <button
          onClick={() => modal.handleClose()}
          className="px-4 py-2 rounded"
          style={{
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleExport}
          disabled={title.trim().length === 0}
          className="px-4 py-2 rounded flex items-center gap-2"
          style={{
            background: "var(--btn-primary)",
            color: "var(--btn-text)",
            opacity: title.trim().length === 0 ? 0.5 : 1,
          }}
        >
          <FiDownload />
          Export PDF
        </button>
      </div>
    </div>
  );
};
