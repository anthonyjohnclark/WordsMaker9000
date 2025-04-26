import { useEffect, useState } from "react";
import { useModal } from "../../../contexts/global/ModalContext";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import { restoreProjectFromBackup } from "../../../utils/fileManager";
import Loader from "../../Loader";
import { useErrorContext } from "../../../contexts/global/ErrorContext";

interface RestoreBackupsModalProps {
  projectName: string;
  onRestoreSuccess: () => void;
}

interface BackupEntry {
  name: string;
  path: string;
}

export default function RestoreBackupsModal({
  projectName,
  onRestoreSuccess,
}: RestoreBackupsModalProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupEntry | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const modal = useModal();

  const { showError } = useErrorContext();

  const BACKUP_DIR = "WordsMaker3000Backups";

  function formatBackupNameToDate(name: string): string {
    const timestampPart = name.substring(projectName.length + 1);
    if (/^\d{8}T\d{6}$/.test(timestampPart)) {
      const year = parseInt(timestampPart.substring(0, 4), 10);
      const month = parseInt(timestampPart.substring(4, 6), 10) - 1; // JS months 0-based
      const day = parseInt(timestampPart.substring(6, 8), 10);
      const hour = parseInt(timestampPart.substring(9, 11), 10);
      const minute = parseInt(timestampPart.substring(11, 13), 10);
      const second = parseInt(timestampPart.substring(13, 15), 10);

      // Create a Date object in UTC
      const utcDate = new Date(
        Date.UTC(year, month, day, hour, minute, second)
      );

      // Convert to local time string
      return utcDate.toLocaleString();
    }
    return name;
  }

  useEffect(() => {
    async function fetchBackups() {
      setIsLoadingBackups(true);
      try {
        const entries = await readDir(BACKUP_DIR, {
          baseDir: BaseDirectory.Document,
        });
        const projectBackups = entries.filter(
          (entry) =>
            entry.name.startsWith(`${projectName}_`) && entry.isDirectory
        );
        const backupsList = projectBackups.map((entry) => ({
          name: entry.name,
          path: entry.name,
        }));
        // Sort backups descending by name (timestamp)
        backupsList.sort((a, b) => b.name.localeCompare(a.name));
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Add 1 second delay
        setBackups(backupsList);
      } catch (error) {
        showError(error, "backing up project");
      } finally {
        setIsLoadingBackups(false);
      }
    }
    fetchBackups();
  }, [projectName]);

  async function handleConfirmRestore() {
    if (!selectedBackup) return;
    setIsRestoring(true);
    try {
      await restoreProjectFromBackup(projectName, selectedBackup.path);
      setIsRestoring(false);
      modal.handleClose();
      onRestoreSuccess();
    } catch (error) {
      setIsRestoring(false);
      console.error("Error restoring backup:", error);
      showError(error, "restoring backup");
    }
  }

  function handleBackupClick(backup: BackupEntry) {
    setSelectedBackup(backup);
  }

  function handleCancelRestore() {
    setSelectedBackup(null);
  }

  if (isLoadingBackups) {
    return (
      <div className="p-6 bg-gray-900 rounded-lg max-w-md mx-auto text-white">
        <Loader />
      </div>
    );
  }

  return (
    <>
      <div className="p-6 bg-gray-900 rounded-lg max-w-md mx-auto text-white">
        <h2 className="text-xl font-bold mb-4 ">
          Restore from backup for{" "}
          <span className="text-blue-500">{projectName}</span>
        </h2>
        {selectedBackup ? (
          <div>
            <p>Are you sure you want to restore from backup:</p>
            <p className="font-mono my-2 text-yellow-500">
              {formatBackupNameToDate(selectedBackup.name)}
            </p>
            <div className="flex justify-end space-x-4 mt-4">
              <button
                onClick={handleCancelRestore}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-gray-600"
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : "Confirm Restore"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {backups.length === 0 ? (
              <p>No backups available for this project.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded p-2 bg-gray-800">
                {backups.map((backup) => {
                  const readableDate = formatBackupNameToDate(backup.name);
                  return (
                    <li
                      key={backup.name}
                      className="cursor-pointer p-2 hover:bg-gray-700 rounded"
                      onClick={() => handleBackupClick(backup)}
                      title={backup.name}
                    >
                      {readableDate}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={modal.handleClose}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
