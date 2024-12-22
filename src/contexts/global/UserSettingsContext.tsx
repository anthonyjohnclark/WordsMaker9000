import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { retrieveSettings, UserSettings } from "../../utils/fileManager";
import { useErrorContext } from "./ErrorContext";

interface UserSettingsContextProps {
  settings: UserSettings | null;
  reloadSettings: () => void;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

const UserSettingsContext = createContext<UserSettingsContextProps | null>(
  null
);

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<UserSettings>({
    defaultFontZoom: 1,
    defaultSaveInterval: 60000, // 1 minute
    defaultBackupInterval: 3600000, // 1 hour
    aiSuiteEnabled: false,
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
      `${settings.defaultFontZoom}px`
    );
  }, [settings.defaultFontZoom]);

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
      "useUserSettings must be used within a UserSettingsProvider"
    );
  }
  return context;
};
