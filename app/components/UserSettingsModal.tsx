import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { saveSettings, UserSettings } from "../utils/fileManager";
import { useUserSettings } from "../contexts/global/UserSettingsContext";
import { useErrorContext } from "../contexts/global/ErrorContext";
import Loadable from "./Loadable";

interface UserSettingsModalProps {
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  onClose,
}) => {
  const { settings, setSettings } = useUserSettings();
  const { showError } = useErrorContext();
  const [isLoading, setIsLoading] = useState(false);

  const saveIntervalOptions = [
    { label: "1 minute", value: 60000 },
    { label: "5 minutes", value: 300000 },
    { label: "10 minutes", value: 600000 },
    { label: "30 minutes", value: 1800000 },
  ];

  const backupIntervalOptions = [
    { label: "30 minutes", value: 1800000 },
    { label: "1 hour", value: 3600000 },
    { label: "2 hours", value: 7200000 },
    { label: "3 hours", value: 10800000 },
  ];

  const { register, handleSubmit, reset } = useForm<UserSettings>({
    defaultValues: {
      defaultFontZoom: settings?.defaultFontZoom,
      defaultSaveInterval: settings?.defaultSaveInterval,
      defaultBackupInterval: settings?.defaultBackupInterval,
      aiSuiteEnabled: settings?.aiSuiteEnabled,
    },
  });

  const onSubmit = async (data: UserSettings) => {
    try {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await saveSettings(data);
      setSettings(data);
    } catch (error) {
      showError(error, "retrieving user settings");
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  return (
    <Loadable isLoading={isLoading}>
      <div className="bg-gray-800 p-6 rounded-lg text-white">
        <h2 className="text-xl font-bold mb-4">User Settings</h2>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">
              Default Font Zoom
            </label>
            <input
              type="number"
              step="0.1"
              {...register("defaultFontZoom", { valueAsNumber: true })}
              className="w-full p-2 bg-gray-700 rounded focus:ring focus:ring-yellow-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">
              Default Save Interval
            </label>
            <select
              {...register("defaultSaveInterval", { valueAsNumber: true })}
              className="w-full p-2 bg-gray-700 rounded focus:ring focus:ring-yellow-500"
            >
              {saveIntervalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">
              Default Backup Interval
            </label>
            <select
              {...register("defaultBackupInterval", { valueAsNumber: true })}
              className="w-full p-2 bg-gray-700 rounded focus:ring focus:ring-yellow-500"
            >
              {backupIntervalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                {...register("aiSuiteEnabled")}
                className="form-checkbox bg-gray-700 text-yellow-500"
              />
              <span>AI Suite Enabled</span>
            </label>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => reset()}
              className="bg-gray-500 px-4 py-2 rounded text-white"
            >
              Reset
            </button>
            <button
              type="submit"
              className="bg-yellow-500 px-4 py-2 rounded text-white"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </Loadable>
  );
};
