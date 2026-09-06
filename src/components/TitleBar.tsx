import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import {
  FiArchive,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiEdit3,
  FiHome,
  FiSearch,
} from "react-icons/fi";
import { formatDateTime } from "../utils/helpers";
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { useLayoutEffect, useState } from "react";
import {
  canNavigateBack,
  canNavigateForward,
  createNavigationHistory,
  updateNavigationHistory,
} from "../utils/navigationHistory";
import {
  formatWritingQuote,
  getRandomWritingQuote,
} from "../utils/writingQuotes";

const TitleBar = () => {
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
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const pathname = location.pathname;
  const isProjectRoute = pathname.startsWith("/projects/");
  const isPublishRoute = pathname.endsWith("/publish");
  const isArtifactsRoute = pathname.endsWith("/artifacts");
  const isEditorRoute = isProjectRoute && !isPublishRoute && !isArtifactsRoute;
  const [navigationHistory, setNavigationHistory] = useState(() =>
    createNavigationHistory(location.key),
  );
  const [homeQuote] = useState(getRandomWritingQuote);
  const formattedHomeQuote = formatWritingQuote(homeQuote);

  useLayoutEffect(() => {
    setNavigationHistory((current) =>
      updateNavigationHistory(current, navigationType, location.key),
    );
  }, [location.key, navigationType]);

  const canGoBack = canNavigateBack(navigationHistory);
  const canGoForward = canNavigateForward(navigationHistory);

  return (
    <div
      className="relative h-8 flex items-center justify-between px-2 select-none overflow-hidden whitespace-nowrap"
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
        className="ml-3 flex items-center shrink-0"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 500 500"
          role="img"
          aria-label="WordsMaker9000 application icon"
          focusable="false"
          style={
            {
              "--wm-logo-background": "var(--bg-primary)",
              "--wm-logo-ink": "var(--accent)",
              "--wm-logo-lettering": "var(--text-primary)",
              "--wm-logo-outline": "var(--bg-primary)",
            } as React.CSSProperties
          }
        >
          <use href="/wordsmaker9000.svg#wordsmaker9000-logo" />
        </svg>
        <div className="ml-5 flex items-center gap-1">
          {pathname !== "/" && (
            <Link
              to="/"
              className="title-bar-navigation-button w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
              style={
                {
                  color: "var(--accent)",
                  background: "transparent",
                  WebkitAppRegion: "no-drag",
                  cursor: "pointer",
                } as React.CSSProperties
              }
              aria-label="Home"
              title="Home"
            >
              <FiHome size={14} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (canGoBack) navigate(-1);
            }}
            disabled={!canGoBack}
            className="title-bar-navigation-button w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
            style={
              {
                color: canGoBack
                  ? "var(--text-secondary)"
                  : "var(--text-muted)",
                background: "transparent",
                WebkitAppRegion: "no-drag",
                cursor: canGoBack ? "pointer" : "default",
              } as React.CSSProperties
            }
            aria-label="Back"
            title="Back"
          >
            <FiChevronLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (canGoForward) navigate(1);
            }}
            disabled={!canGoForward}
            className="title-bar-navigation-button w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
            style={
              {
                color: canGoForward
                  ? "var(--text-secondary)"
                  : "var(--text-muted)",
                background: "transparent",
                WebkitAppRegion: "no-drag",
                cursor: canGoForward ? "pointer" : "default",
              } as React.CSSProperties
            }
            aria-label="Forward"
            title="Forward"
          >
            <FiChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Keep the home-page quotation centered independently of the controls. */}
      {pathname === "/" && (
        <h2
          className="absolute left-24 right-24 truncate text-center text-sm italic font-medium"
          style={{ color: "var(--text-secondary)" }}
          title={`${formattedHomeQuote} — ${homeQuote.source}`}
          aria-label={`${formattedHomeQuote}. Source: ${homeQuote.source}`}
        >
          {formattedHomeQuote}
        </h2>
      )}

      {/* Render project-related info if not on the home page */}
      {pathname !== "/" && projectName && (
        <>
          <h2 className="text-lg font-semibold futuristic-font truncate min-w-0">
            <span style={{ color: "var(--text-primary)" }}>
              {decodeURIComponent(projectName)}
            </span>
          </h2>
          {!isLoading && isEditorRoute && (
            <>
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
                  <span style={{ color: "var(--text-muted)" }}>
                    Backing up...
                  </span>
                ) : lastBackupTime ? (
                  <>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Backed up at {formatDateTime(lastBackupTime)}
                    </span>
                    <FiCheckCircle style={{ color: "var(--btn-success)" }} />
                  </>
                ) : (
                  <span style={{ color: "var(--btn-danger)" }}>
                    No backups yet
                  </span>
                )}
              </div>
              {wordCount !== null && (
                <span
                  className="shrink-0"
                  style={{ color: "var(--btn-primary)" }}
                >
                  {wordCount} words
                </span>
              )}
            </>
          )}
          {isProjectRoute && (
            <div className="ml-3 mr-4 flex items-center gap-1">
              {!isEditorRoute && (
                <TitleBarRouteButton
                  label="Editor"
                  title="Editor"
                  ariaLabel="Open editor"
                  icon={<FiEdit3 size={12} />}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}`);
                  }}
                />
              )}
              {!isPublishRoute && (
                <TitleBarRouteButton
                  label="Publish"
                  title="Publish project"
                  ariaLabel="Open publish page"
                  icon={<span aria-hidden="true">🚀</span>}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}/publish`);
                  }}
                />
              )}
              {!isArtifactsRoute && (
                <TitleBarRouteButton
                  label="Artifacts"
                  title="Artifacts"
                  ariaLabel="Open artifact history"
                  icon={<FiArchive size={12} />}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}/artifacts`);
                  }}
                />
              )}
            </div>
          )}
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

function TitleBarRouteButton({
  label,
  title,
  ariaLabel,
  icon,
  onClick,
}: {
  label: string;
  title: string;
  ariaLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 px-2 rounded flex items-center gap-1 text-xs font-semibold transition-colors shrink-0"
      style={
        {
          color: "var(--text-primary)",
          background: "transparent",
          WebkitAppRegion: "no-drag",
          cursor: "pointer",
        } as React.CSSProperties
      }
      onMouseEnter={(event) =>
        (event.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(event) =>
        (event.currentTarget.style.background = "transparent")
      }
      aria-label={ariaLabel}
      title={title}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default TitleBar;
