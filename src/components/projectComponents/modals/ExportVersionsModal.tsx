import { useEffect, useState } from "react";
import { FiExternalLink } from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { useModal } from "../../../contexts/global/ModalContext";
import Loader from "../../Loader";

interface ExportVersionsModalProps {
  projectName: string;
}

interface ExportEntry {
  filename: string;
  path: string;
  modified: string;
}

export default function ExportVersionsModal({
  projectName,
}: ExportVersionsModalProps) {
  const [exports, setExports] = useState<ExportEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const modal = useModal();

  useEffect(() => {
    async function fetchExports() {
      setIsLoading(true);
      try {
        const entries = await invoke<ExportEntry[]>("list_project_exports", {
          projectName,
        });
        setExports(entries);
      } catch (error) {
        console.error("Failed to list exports:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchExports();
  }, [projectName]);

  const handleOpen = async (path: string) => {
    try {
      await invoke("open_file_default", { path });
    } catch (error) {
      console.error("Failed to open PDF:", error);
    }
  };

  if (isLoading) {
    return (
      <div
        className="p-6 rounded-lg max-w-md mx-auto"
        style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
      >
        <Loader />
      </div>
    );
  }

  return (
    <div
      className="p-6 rounded-lg max-w-md mx-auto"
      style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
    >
      <h2 className="text-xl font-bold mb-4">
        Exports for{" "}
        <span style={{ color: "var(--btn-primary)" }}>
          {decodeURIComponent(projectName)}
        </span>
      </h2>

      {exports.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          No exports found for this project.
        </p>
      ) : (
        <ul
          className="max-h-64 overflow-y-auto rounded p-2 space-y-2"
          style={{ background: "var(--bg-input)" }}
        >
          {exports.map((entry) => (
            <li
              key={entry.path}
              className="flex items-center justify-between p-2 rounded"
              style={{ color: "var(--text-primary)" }}
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium truncate">{entry.filename}</p>
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {entry.modified}
                </p>
              </div>
              <button
                onClick={() => handleOpen(entry.path)}
                className="p-2 rounded flex-shrink-0"
                style={{
                  background: "var(--btn-primary)",
                  color: "var(--btn-text)",
                }}
                title="Open PDF"
              >
                <FiExternalLink />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={modal.handleClose}
          className="px-4 py-2 rounded"
          style={{
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
