import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import {
  FiCheckCircle,
  FiHome,
  FiSearch,
} from "react-icons/fi";
import { formatDateTime } from "../utils/helpers";
import { Link, useLocation } from "react-router-dom";
import { useModal } from "../contexts/global/ModalContext";
import { ExportModal } from "./projectComponents/modals/ExportModal";

const TitleBar = () => {
  const modal = useModal();
  const {
    projectName,
    wordCount,
    isLoading,
    isBackingUp,
    lastBackupTime,
    setIsSearchOpen,
  } = useGlobalProjectContext();

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().maximize();

  // Get the current route path
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div
      className="h-8 flex items-center justify-between px-2 select-none overflow-hidden whitespace-nowrap"
      style={
        {
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      {/* App Logo and Title */}
      <div
        className="flex items-center space-x-2 shrink-0"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {pathname !== "/" && ( // Only show the link if not at the home page
          <Link
            to="/" // Use `to` for navigation in React Router
            className="text-sm font-semibold futuristic-font flex items-center space-x-1 truncate"
            style={
              {
                color: "var(--accent)",
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
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
          <h2 className="text-lg font-semibold futuristic-font truncate min-w-0">
            <span style={{ color: "var(--text-primary)" }}>
              {decodeURIComponent(projectName)}
            </span>
          </h2>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="p-1 rounded transition-colors shrink-0"
            style={
              {
                color: "var(--text-secondary)",
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--accent)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
            aria-label="Search & Replace"
            title="Search & Replace (Ctrl+Shift+F)"
          >
            <FiSearch size={14} />
          </button>
          <div className="text-sm flex items-center space-x-2 shrink-0">
            {isBackingUp ? (
              <span style={{ color: "var(--text-muted)" }}>Backing up...</span>
            ) : lastBackupTime ? (
              <>
                <span style={{ color: "var(--text-secondary)" }}>
                  Backed up at {formatDateTime(lastBackupTime)}
                </span>
                <FiCheckCircle style={{ color: "var(--btn-success)" }} />
              </>
            ) : (
              <span style={{ color: "var(--btn-danger)" }}>No backups yet</span>
            )}
          </div>
          {wordCount !== null && (
            <span className="shrink-0" style={{ color: "var(--btn-primary)" }}>
              {wordCount} words
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              modal.renderModal({
                modalBody: <ExportModal />,
                modalSize: "wide",
              });
            }}
            className="h-6 px-2 ml-3 mr-4 rounded flex items-center gap-1 text-xs font-semibold transition-colors shrink-0"
            style={
              {
                color: "var(--text-primary)",
                background: "var(--bg-input)",
                WebkitAppRegion: "no-drag",
                cursor: "pointer",
              } as React.CSSProperties
            }
            onMouseEnter={(event) =>
              (event.currentTarget.style.background = "var(--bg-hover)")
            }
            onMouseLeave={(event) =>
              (event.currentTarget.style.background = "var(--bg-input)")
            }
            aria-label="Publish project"
            title="Publish project"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              🚀
            </span>
            <span>Publish</span>
          </button>
        </>
      )}

      {/* Window Controls */}
      <div
        className="flex space-x-2 shrink-0"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center transition-colors"
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
          aria-label="Minimize"
        >
          &#8211;
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center transition-colors"
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
          aria-label="Maximize"
        >
          &#9633;
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center transition-colors"
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--btn-danger)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
          aria-label="Close"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
