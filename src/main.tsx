import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StrictMode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Show the window now that the splash screen HTML is painted
getCurrentWindow().show();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
