import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StrictMode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyTheme } from "./themes";
import { retrieveSettings, type UserSettings } from "./utils/fileManager";

// Show the window now that the splash screen HTML is painted
void getCurrentWindow().show();

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const renderApp = (initialSettings?: UserSettings) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App initialSettings={initialSettings} />
      </BrowserRouter>
    </StrictMode>,
  );
};

const loadInitialSettings = async (): Promise<UserSettings | undefined> => {
  try {
    const settings = await retrieveSettings();
    applyTheme(settings.theme);
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.defaultFontZoom}px`,
    );
    return settings;
  } catch (error) {
    // The provider retries after mounting so the normal global error UI can
    // report an unreadable settings file.
    console.error("Error preloading user settings:", error);
    return undefined;
  }
};

const startApp = async () => {
  const [initialSettings] = await Promise.all([
    loadInitialSettings(),
    wait(2500),
  ]);

  const splash = document.getElementById("splash");
  if (splash) {
    splash.style.transition = "opacity 0.5s ease-out";
    splash.style.opacity = "0";
    await wait(500);
  }

  renderApp(initialSettings);
};

void startApp();
