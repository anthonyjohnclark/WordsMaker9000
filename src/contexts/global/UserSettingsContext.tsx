import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { retrieveSettings, UserSettings } from "../../utils/fileManager";
import { useErrorContext } from "./ErrorContext";
import { themes } from "../../themes";

interface UserSettingsContextProps {
  settings: UserSettings | null;
  reloadSettings: () => void;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

const UserSettingsContext = createContext<UserSettingsContextProps | null>(
  null,
);

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<UserSettings>({
    defaultFontZoom: 1,
    defaultSaveInterval: 60000, // 1 minute
    defaultBackupInterval: 3600000, // 1 hour
    aiSuiteEnabled: false,
    theme: "midnight",
  });

  const { showError } = useErrorContext();

  const reloadSettings = useCallback(async () => {
    try {
      const fetchedSettings = await retrieveSettings();
      setSettings(fetchedSettings);
    } catch (error) {
      showError(error, "retrieving settings");
    }
  }, [showError]);

  useEffect(() => {
    reloadSettings();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.defaultFontZoom}px`,
    );
  }, [settings.defaultFontZoom]);

  useEffect(() => {
    const themeName = settings.theme || "midnight";
    const theme = themes[themeName];
    if (theme) {
      const root = document.documentElement;
      Object.entries(theme.variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [settings.theme]);

  return (
    <UserSettingsContext.Provider
      value={{ settings, reloadSettings, setSettings }}
    >
      {children}
    </UserSettingsContext.Provider>
  );
};

export const useUserSettings = () => {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error(
      "useUserSettings must be used within a UserSettingsProvider",
    );
  }
  return context;
};
