import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StrictMode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Show the window now that the splash screen HTML is painted
getCurrentWindow().show();

// Hold the splash screen for 3 seconds before mounting the React app.
// It will stay fully visible for 2.5 seconds, then smoothly fade out over 0.5 seconds.
setTimeout(() => {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.style.transition = "opacity 0.5s ease-out";
    splash.style.opacity = "0";

    // Wait for the fade-out transition to complete before rendering React
    setTimeout(() => {
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </StrictMode>,
      );
    }, 500);
  } else {
    // Fallback if splash element is not found
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  }
}, 2500);
