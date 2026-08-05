import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  DEFAULT_USER_SETTINGS,
  retrieveSettings,
  UserSettings,
} from "../../utils/fileManager";
import { useErrorContext } from "./ErrorContext";
import { applyTheme } from "../../themes";

interface UserSettingsContextProps {
  settings: UserSettings | null;
  reloadSettings: () => void;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

const UserSettingsContext = createContext<UserSettingsContextProps | null>(
  null,
);

type UserSettingsProviderProps = {
  children: React.ReactNode;
  initialSettings?: UserSettings;
};

export const UserSettingsProvider: React.FC<UserSettingsProviderProps> = ({
  children,
  initialSettings,
}) => {
  const [settings, setSettings] = useState<UserSettings>(
    initialSettings ?? DEFAULT_USER_SETTINGS,
  );

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
    if (!initialSettings) {
      reloadSettings();
    }
  }, [initialSettings, reloadSettings]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.defaultFontZoom}px`,
    );
  }, [settings.defaultFontZoom]);

  useLayoutEffect(() => {
    applyTheme(settings.theme);
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
