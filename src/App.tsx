import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import TitleBar from "./components/TitleBar";
import Home from "./components/Home";
import Project from "./components/Project";
import ErrorModal from "./components/ErrorModal";
import { ErrorProvider } from "./contexts/global/ErrorContext";
import { GlobalProjectProvider } from "./contexts/global/GlobalProjectContext";
import { ProvideModal } from "./contexts/global/ModalContext";
import { UserSettingsProvider } from "./contexts/global/UserSettingsContext";
import type { UserSettings } from "./utils/fileManager";
import {
  listProjectsSummary,
  retrieveLastActiveSession,
} from "./utils/fileManager";

type AppProps = {
  initialSettings?: UserSettings;
};

function App({ initialSettings }: AppProps) {
  return (
    <ErrorProvider>
      <GlobalProjectProvider>
        <UserSettingsProvider initialSettings={initialSettings}>
          <ErrorModal />
          <ProvideModal>
            <div className="grid grid-rows-[auto,1fr] h-screen">
              <TitleBar /> {/* Always present */}
              <main
                className="overflow-hidden"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                <StartupRoutes />
              </main>
            </div>
          </ProvideModal>
        </UserSettingsProvider>
      </GlobalProjectProvider>
    </ErrorProvider>
  );
}

function StartupRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [startupResolved, setStartupResolved] = useState(false);

  useEffect(() => {
    if (location.pathname !== "/" || startupResolved) return;

    let cancelled = false;

    async function resolveStartupRoute() {
      const session = await retrieveLastActiveSession();
      if (!session) {
        if (!cancelled) setStartupResolved(true);
        return;
      }

      try {
        const projects = await listProjectsSummary();
        const projectExists = projects.some(
          (project) =>
            decodeURIComponent(project.projectName) ===
            decodeURIComponent(session.projectName),
        );

        if (!cancelled && projectExists) {
          navigate(`/projects/${encodeURIComponent(session.projectName)}`, {
            replace: true,
          });
        }
      } catch (error) {
        console.warn("Unable to restore last active project:", error);
      } finally {
        if (!cancelled) setStartupResolved(true);
      }
    }

    void resolveStartupRoute();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate, startupResolved]);

  if (location.pathname === "/" && !startupResolved) return null;

  return (
    <Routes>
      <Route path="/projects/:projectName/*" element={<Project />} />
      <Route path="/" element={<Home />} />
    </Routes>
  );
}

export default App;
