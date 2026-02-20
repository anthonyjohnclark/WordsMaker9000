import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { saveSettings, UserSettings } from "../utils/fileManager";
import { useUserSettings } from "../contexts/global/UserSettingsContext";
import { useErrorContext } from "../contexts/global/ErrorContext";
import Loadable from "./Loadable";
import { themes, ThemeName } from "../themes";
import ThemePickerModal from "./ThemePickerModal";

interface UserSettingsModalProps {
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  onClose,
}) => {
  const { settings, setSettings } = useUserSettings();
  const { showError } = useErrorContext();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>(
    settings?.theme || "midnight",
  );
  const [showThemePicker, setShowThemePicker] = useState(false);

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

  const { register, handleSubmit, reset, setValue } = useForm<UserSettings>({
    defaultValues: {
      defaultFontZoom: settings?.defaultFontZoom,
      defaultSaveInterval: settings?.defaultSaveInterval,
      defaultBackupInterval: settings?.defaultBackupInterval,
      aiSuiteEnabled: settings?.aiSuiteEnabled,
      theme: settings?.theme || "midnight",
    },
  });

  const handleThemeSelect = (themeName: ThemeName) => {
    setSelectedTheme(themeName);
    setValue("theme", themeName);
  };

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
      <div
        className="p-6 rounded-lg"
        style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
      >
        <h2 className="text-xl font-bold mb-4">User Settings</h2>
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Theme Picker */}
          <div className="mb-5">
            <label className="block text-sm font-bold mb-3">Theme</label>
            <button
              type="button"
              onClick={() => setShowThemePicker(true)}
              className="w-full flex items-center justify-between rounded-lg p-3 transition-all"
              style={{
                background: themes[selectedTheme].variables["--bg-primary"],
                color: themes[selectedTheme].variables["--text-primary"],
                border: `2px solid ${themes[selectedTheme].variables["--accent"]}`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Color swatches */}
                <div className="flex gap-1">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{
                      background: themes[selectedTheme].variables["--accent"],
                    }}
                  />
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{
                      background:
                        themes[selectedTheme].variables["--btn-primary"],
                    }}
                  />
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{
                      background:
                        themes[selectedTheme].variables["--btn-success"],
                    }}
                  />
                </div>
                <span className="font-semibold">
                  {themes[selectedTheme].label}
                </span>
                <span
                  className="text-xs opacity-60 truncate"
                  style={{
                    fontFamily:
                      themes[selectedTheme].variables["--editor-font-family"],
                  }}
                >
                  {themes[selectedTheme].variables["--editor-font-family"]
                    .split(",")[0]
                    .replace(/'/g, "")}
                </span>
              </div>
              <span className="text-sm opacity-70 shrink-0 ml-3">
                Change &rarr;
              </span>
            </button>
          </div>

          {showThemePicker && (
            <ThemePickerModal
              selectedTheme={selectedTheme}
              onSelect={handleThemeSelect}
              onClose={() => setShowThemePicker(false)}
            />
          )}

          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">
              Default Font Zoom
            </label>
            <input
              type="number"
              step="0.1"
              {...register("defaultFontZoom", { valueAsNumber: true })}
              className="w-full p-2 rounded focus:outline-none"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">
              Default Save Interval
            </label>
            <select
              {...register("defaultSaveInterval", { valueAsNumber: true })}
              className="w-full p-2 rounded focus:outline-none"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
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
              className="w-full p-2 rounded focus:outline-none"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
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
                className="form-checkbox"
                style={{ accentColor: "var(--accent)" }}
              />
              <span>AI Suite Enabled</span>
            </label>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 rounded"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
            >
              Reset
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded"
              style={{
                background: "var(--btn-success)",
                color: "var(--btn-text)",
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </Loadable>
  );
};
