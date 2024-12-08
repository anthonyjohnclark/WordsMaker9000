"use client";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TitleBar = () => {
  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().maximize();

  return (
    <div
      className="h-8 bg-gray-800 text-white flex items-center justify-between px-2 select-none"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* App Title */}
      <span className="text-sm font-semibold">Gilgamesh</span>

      {/* Window Controls */}
      <div className="flex space-x-2" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          onClick={() => handleMinimize()}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-600 transition-colors"
          aria-label="Minimize"
        >
          &#8211;
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-600 transition-colors"
          aria-label="Maximize"
        >
          &#9633;
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
          aria-label="Close"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
