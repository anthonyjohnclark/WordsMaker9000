import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiArchive,
  FiCopy,
  FiExternalLink,
  FiFolder,
  FiRefreshCw,
  FiTrash2,
} from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { v4 as uuidv4 } from "uuid";

import { useErrorContext } from "../../../contexts/global/ErrorContext";
import { useModal } from "../../../contexts/global/ModalContext";
import type {
  ArtifactHistoryEntry,
  Diagnostic,
  PublishResult,
} from "../../../types/PublishingTypes";
import {
  diagnosticsBySeverity,
  formatPublishFailure,
  parsePublishFailure,
} from "../../../utils/publishingForm";
import Loader from "../../Loader";

interface ExportVersionsModalProps {
  projectName: string;
  mode?: "modal" | "page";
  onArtifactsChanged?: () => void;
}

export default function ExportVersionsModal({
  projectName,
  mode = "modal",
  onArtifactsChanged,
}: ExportVersionsModalProps) {
  const [artifacts, setArtifacts] = useState<ArtifactHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPath, setBusyPath] = useState("");
  const [notice, setNotice] = useState("");
  const modal = useModal();
  const { showError } = useErrorContext();
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const decodedProjectName = decodeURIComponent(projectName);

  const fetchArtifacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await invoke<ArtifactHistoryEntry[]>(
        "list_publication_history",
        { projectName: decodedProjectName },
      );
      setArtifacts(entries);
    } catch (error) {
      showErrorRef.current(error, "loading artifact history");
    } finally {
      setIsLoading(false);
    }
  }, [decodedProjectName]);

  useEffect(() => {
    void fetchArtifacts();
  }, [fetchArtifacts]);

  const runForEntry = async (
    entry: ArtifactHistoryEntry,
    action: () => Promise<void>,
    context: string,
  ) => {
    setBusyPath(entry.path);
    setNotice("");
    try {
      await action();
    } catch (error) {
      showError(error, context);
    } finally {
      setBusyPath("");
    }
  };

  const handleOpen = (entry: ArtifactHistoryEntry) =>
    runForEntry(
      entry,
      () => invoke("open_file_default", { path: entry.path }),
      "opening published artifact",
    );

  const handleReveal = (entry: ArtifactHistoryEntry) =>
    runForEntry(
      entry,
      () =>
        invoke("reveal_publication_artifact", {
          projectName: decodedProjectName,
          exportId: entry.export_id,
          filename: entry.filename,
        }),
      "revealing published artifact",
    );

  const handleCopy = async (entry: ArtifactHistoryEntry) => {
    const destination = await save({
      title: `Copy ${entry.format.toUpperCase()} artifact`,
      defaultPath: entry.filename,
      filters: [
        {
          name: `${entry.format.toUpperCase()} artifact`,
          extensions: [entry.format],
        },
      ],
    });
    if (!destination) return;
    await runForEntry(
      entry,
      () =>
        invoke("copy_publication_artifact", {
          projectName: decodedProjectName,
          exportId: entry.export_id,
          filename: entry.filename,
          destination,
        }),
      "copying published artifact",
    );
    setNotice(`Copied ${entry.filename}.`);
  };

  const handleRegenerate = async (entry: ArtifactHistoryEntry) => {
    if (!entry.export_id || !entry.can_regenerate) return;
    const destination = await save({
      title: `Regenerate ${entry.format.toUpperCase()} artifact`,
      defaultPath: entry.filename,
      filters: [
        {
          name: `${entry.format.toUpperCase()} artifact`,
          extensions: [entry.format],
        },
      ],
    });
    if (!destination) return;
    setBusyPath(entry.path);
    setNotice("");
    try {
      const result = await invoke<PublishResult>("regenerate_publication", {
        projectName: decodedProjectName,
        exportId: entry.export_id,
        newExportId: uuidv4(),
        destination,
      });
      setNotice(
        `Regenerated ${result.primary_artifact_path.split(/[\\/]/).pop() ?? entry.filename}.`,
      );
      await fetchArtifacts();
      onArtifactsChanged?.();
    } catch (error) {
      const failure = parsePublishFailure(error);
      showError(formatPublishFailure(failure), "regenerating publication");
    } finally {
      setBusyPath("");
    }
  };

  const handleDelete = async (entry: ArtifactHistoryEntry) => {
    const scope = entry.export_id
      ? "This removes the artifact and its manifest from project history."
      : "This removes the legacy export file.";
    if (!window.confirm(`Delete "${entry.filename}"?\n\n${scope}`)) return;
    await runForEntry(
      entry,
      () =>
        invoke("delete_publication_history_entry", {
          projectName: decodedProjectName,
          exportId: entry.export_id,
          filename: entry.filename,
        }),
      "deleting artifact history",
    );
    await fetchArtifacts();
    onArtifactsChanged?.();
  };

  if (isLoading) {
    return (
      <div
        className={
          mode === "modal" ? "artifacts-page p-6 rounded-lg max-w-5xl mx-auto" : "absolute inset-0 flex items-center justify-center"
        }
        style={{
          background: mode === "modal" ? "var(--modal-bg)" : "transparent",
          color: "var(--text-primary)",
        }}
      >
        <Loader />
      </div>
    );
  }

  return (
    <div
      className={
        mode === "modal"
          ? "artifacts-page p-6 rounded-lg max-w-5xl mx-auto"
          : "artifacts-page w-full max-w-6xl mx-auto pb-6"
      }
      style={{
        background: mode === "modal" ? "var(--modal-bg)" : "transparent",
        color: "var(--text-primary)",
      }}
    >
      <header className="mb-6">
        <h2 className="text-2xl font-normal flex items-center gap-2">
          <FiArchive size={20} aria-hidden="true" style={{ color: "var(--accent)" }} />
          {mode === "modal" ? `Artifacts for ${decodedProjectName}` : "Artifacts"}
        </h2>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Published files for this project.
        </p>
      </header>

      {notice && (
        <p
          className="rounded border px-4 py-3 mb-4 text-sm"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--btn-success)",
          }}
          role="status"
        >
          {notice}
        </p>
      )}

      {artifacts.length === 0 ? (
        <div className="artifacts-empty">
          <p className="text-sm">No published files yet.</p>
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            Create an edition on the Publish page to see it here.
          </p>
        </div>
      ) : (
        <ul
          className={
            mode === "modal"
              ? "artifacts-list max-h-[60vh] overflow-y-auto"
              : "artifacts-list"
          }
        >
          {artifacts.map((entry) => {
            const busy = busyPath === entry.path;
            return (
              <li
                key={entry.path}
                className="artifact-row px-5 py-4"
                style={{
                  borderColor: "var(--border-color)",
                  background: "var(--bg-primary)",
                }}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate"
                      title={entry.filename}>
                      {entry.filename}
                    </p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {entry.format.toUpperCase()}
                      {entry.profile_id
                        ? ` · ${entry.profile_id.replace(/_/g, " ")}`
                        : ""}
                      {entry.legacy ? " · legacy" : ""} ·{" "}
                      {formatTimestamp(entry.modified)}
                    </p>
                  </div>
                  <div className="artifact-actions flex flex-wrap items-center gap-1 lg:justify-end">
                    <HistoryButton
                      title={`Preview actual ${entry.format.toUpperCase()} artifact`}
                      onClick={() => void handleOpen(entry)}
                      disabled={busy}
                    >
                      <FiExternalLink /> Preview
                    </HistoryButton>
                    <HistoryButton
                      title="Reveal in folder"
                      onClick={() => void handleReveal(entry)}
                      disabled={busy}
                    >
                      <FiFolder /> Reveal
                    </HistoryButton>
                    <HistoryButton
                      title="Copy to destination"
                      onClick={() => void handleCopy(entry)}
                      disabled={busy}
                    >
                      <FiCopy /> Copy
                    </HistoryButton>
                    <HistoryButton
                      title={
                        entry.can_regenerate
                          ? "Regenerate from the saved publishing recipe"
                          : "Legacy manifests cannot be regenerated"
                      }
                      onClick={() => void handleRegenerate(entry)}
                      disabled={busy || !entry.can_regenerate}
                    >
                      <FiRefreshCw /> Regenerate
                    </HistoryButton>
                    <HistoryButton
                      title="Delete from artifact history"
                      onClick={() => void handleDelete(entry)}
                      disabled={busy}
                      danger
                    >
                      <FiTrash2 /> Delete
                    </HistoryButton>
                  </div>
                </div>
                <HistoryDiagnostics diagnostics={entry.diagnostics ?? []} />
              </li>
            );
          })}
        </ul>
      )}

      {mode === "modal" && (
        <div className="flex justify-end mt-4">
          <button
            onClick={modal.handleClose}
            className="px-4 py-2 rounded border input-button"
            style={{ borderColor: "var(--border-color)" }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryButton({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`artifact-action px-2 py-1.5 rounded text-xs flex items-center gap-1.5 disabled:opacity-40 ${danger ? "artifact-action-danger" : ""}`}
      style={{
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

function HistoryDiagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  const grouped = diagnosticsBySeverity(diagnostics);
  return (
    <details className="mt-3">
      <summary
        className="text-xs cursor-pointer"
        style={{ color: "var(--text-secondary)" }}
      >
        Diagnostics: {grouped.error.length} errors, {grouped.warning.length}{" "}
        warnings, {grouped.info.length} information
      </summary>
      <div className="grid gap-2 mt-2 text-xs">
        {(["error", "warning", "info"] as const).map((severity) =>
          grouped[severity].length > 0 ? (
            <section key={severity}>
              <strong className="capitalize">{severity}</strong>
              <ul className="list-disc pl-5">
                {grouped[severity].map((diagnostic, index) => (
                  <li key={`${diagnostic.code}-${index}`}>
                    {diagnostic.code}: {diagnostic.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
      </div>
    </details>
  );
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value || "unknown time"
    : timestamp.toLocaleString();
}
