import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import { FiCheckCircle, FiHome } from "react-icons/fi";
import { formatDateTime } from "../utils/helpers";
import { Link, useLocation } from "react-router-dom";

const TitleBar = () => {
  const { projectName, wordCount, isLoading, isBackingUp, lastBackupTime } =
    useGlobalProjectContext();

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().maximize();

  // Get the current route path
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div
      className="h-8 bg-gray-800 text-white flex items-center justify-between px-2 select-none"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* App Logo and Title */}
      <div
        className="flex items-center space-x-2"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {pathname !== "/" && ( // Only show the link if not at the home page
          <Link
            to="/" // Use `to` for navigation in React Router
            className="text-sm font-semibold futuristic-font text-yellow-500 flex items-center space-x-1"
            style={{
              WebkitAppRegion: "no-drag",
              cursor: "pointer",
            }}
          >
            <FiHome /> {/* Add the home icon here */}
            <span>WordsMaker9000</span>
          </Link>
        )}
      </div>

      {/* Render "Welcome!" if on the home page */}
      {pathname === "/" && <h2 className="text-lg font-semibold">Welcome!</h2>}

      {/* Render project-related info if not on the home page */}
      {pathname !== "/" && !isLoading && projectName && (
        <>
          <h2 className="text-lg font-semibold futuristic-font">
            <span className="text-white">
              {decodeURIComponent(projectName)}
            </span>
          </h2>
          <div className="text-sm flex items-center space-x-2">
            {isBackingUp ? (
              <span className="text-gray-500">Backing up...</span>
            ) : lastBackupTime ? (
              <>
                <span className="text-gray-400">
                  Backed up at {formatDateTime(lastBackupTime)}
                </span>
                <FiCheckCircle className="text-green-500" />
              </>
            ) : (
              <span className="text-red-500">No backups yet</span>
            )}
          </div>
          {wordCount !== null && (
            <span className="text-blue-500">{wordCount} words</span>
          )}
        </>
      )}

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
