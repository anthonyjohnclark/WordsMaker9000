"use client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Link from "next/link";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";

const TitleBar = () => {
  const { projectName, wordCount, isLoading } = useGlobalProjectContext();

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().maximize();

  return (
    <div
      className="h-8 bg-gray-800 text-white flex items-center justify-between px-2 select-none"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* App Title */}
      <Link
        href="/"
        passHref
        className="text-sm font-semibold futuristic-font"
        style={{ WebkitAppRegion: "no-drag", cursor: "pointer" }}
      >
        WordsMaker9000
      </Link>
      {!isLoading ? (
        projectName ? (
          <>
            <h2 className="text-lg font-semibold">
              <span className="text-yellow-500">
                {decodeURIComponent(projectName)}
              </span>
            </h2>
            {wordCount !== null && (
              <span className="text-green-500">({wordCount} words)</span>
            )}
          </>
        ) : (
          <h2 className="text-lg font-semibold">Welcome!</h2>
        )
      ) : null}

      {/* Window Controls */}
      <div className="flex space-x-2" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-500 transition-colors"
          aria-label="Minimize"
        >
          &#8211;
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-500 transition-colors"
          aria-label="Maximize"
        >
          &#9633;
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-500 transition-colors"
          aria-label="Close"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
