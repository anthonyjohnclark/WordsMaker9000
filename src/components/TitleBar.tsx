import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import {
  FiArchive,
  FiChevronLeft,
  FiChevronRight,
  FiEdit3,
  FiHome,
  FiSearch,
  FiSidebar,
  FiUpload,
} from "react-icons/fi";
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { useLayoutEffect, useRef, useState } from "react";
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
    setIsSearchOpen,
    isSidebarOpen,
    setIsSidebarOpen,
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
  const leftControlsRef = useRef<HTMLDivElement>(null);
  const rightControlsRef = useRef<HTMLDivElement>(null);
  const [titleInset, setTitleInset] = useState(0);

  useLayoutEffect(() => {
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!left || !right) return;

    const updateTitleInset = () => {
      // Include the outer padding, left margin, and a gap beside each group.
      setTitleInset(Math.max(left.offsetWidth + 20, right.offsetWidth + 8) + 8);
    };
    updateTitleInset();
    const observer = new ResizeObserver(updateTitleInset);
    observer.observe(left);
    observer.observe(right);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setNavigationHistory((current) =>
      updateNavigationHistory(current, navigationType, location.key),
    );
  }, [location.key, navigationType]);

  const canGoBack = canNavigateBack(navigationHistory);
  const canGoForward = canNavigateForward(navigationHistory);

  return (
    <div
      className="app-title-bar relative h-8 flex items-center justify-between px-2 select-none overflow-hidden whitespace-nowrap"
      style={
        {
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      <div
        ref={leftControlsRef}
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
          {isEditorRoute && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen((current) => !current)}
              className="title-bar-navigation-button w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
              style={
                {
                  color: isSidebarOpen
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                  background: "transparent",
                  WebkitAppRegion: "no-drag",
                  cursor: "pointer",
                } as React.CSSProperties
              }
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={isSidebarOpen}
              aria-controls="project-sidebar"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <span className="relative block h-4 w-4" aria-hidden="true">
                <FiSidebar size={16} className="block" />
                {isSidebarOpen ? (
                  <FiChevronLeft className="absolute right-0 top-1" size={8} />
                ) : (
                  <FiChevronRight className="absolute right-0 top-1" size={8} />
                )}
              </span>
            </button>
          )}
        </div>
        {isProjectRoute && projectName && (
          <div className="ml-5 flex items-center gap-1">
              {!isEditorRoute && (
                <TitleBarRouteButton
                  title="Editor"
                  ariaLabel="Open editor"
                  icon={<FiEdit3 size={14} />}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}`);
                  }}
                />
              )}
              {!isPublishRoute && (
                <TitleBarRouteButton
                  title="Publish project"
                  ariaLabel="Open publish page"
                  icon={<FiUpload size={14} />}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}/publish`);
                  }}
                />
              )}
              {!isArtifactsRoute && (
                <TitleBarRouteButton
                  title="Artifacts"
                  ariaLabel="Open artifact history"
                  icon={<FiArchive size={14} />}
                  onClick={() => {
                    const encoded = encodeURIComponent(projectName);
                    navigate(`/projects/${encoded}/artifacts`);
                  }}
                />
              )}
            </div>
          )}
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

      {pathname !== "/" && projectName && (
        <h2
          className="absolute min-w-0 truncate text-center text-lg font-semibold futuristic-font"
          style={{
            left: titleInset,
            right: titleInset,
            color: "var(--text-primary)",
            pointerEvents: "none",
          }}
        >
          {decodeURIComponent(projectName)}
        </h2>
      )}

      {/* Search and word count immediately precede the window controls. */}
      <div ref={rightControlsRef} className="flex items-center gap-4 shrink-0">
        {pathname !== "/" && projectName && !isLoading && isEditorRoute && (
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="title-bar-navigation-button p-1 rounded transition-colors shrink-0"
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
              <FiSearch size={14} aria-hidden="true" />
            </button>
            {wordCount !== null && (
              <span className="mr-2 shrink-0" style={{ color: "var(--text-secondary)" }}>
                {wordCount} words
              </span>
            )}
          </div>
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
    </div>
  );
};

function TitleBarRouteButton({
  title,
  ariaLabel,
  icon,
  onClick,
}: {
  title: string;
  ariaLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="title-bar-navigation-button w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
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
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

export default TitleBar;
