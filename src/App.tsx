import { useEffect, useRef, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import TitleBar from "./components/TitleBar";
import Home from "./components/Home";
import Loader from "./components/Loader";
import Project from "./components/Project";
import ErrorModal from "./components/ErrorModal";
import { ErrorProvider } from "./contexts/global/ErrorContext";
import { GlobalProjectProvider } from "./contexts/global/GlobalProjectContext";
import { ProvideModal } from "./contexts/global/ModalContext";
import { UserSettingsProvider } from "./contexts/global/UserSettingsContext";
import type { UserSettings } from "./utils/fileManager";
import {
  fetchFullMetadata,
  listProjectsSummary,
  readFile,
  retrieveLastActiveSession,
  saveLastActiveSession,
} from "./utils/fileManager";

type AppProps = {
  initialSettings?: UserSettings;
};

function App({ initialSettings }: AppProps) {
  const navigate = useNavigate();
  const hasStarted = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isRestoringProject, setIsRestoringProject] = useState(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function restoreLastActiveSession() {
      try {
        const session = await retrieveLastActiveSession();
        if (session?.location === "project") {
          setIsRestoringProject(true);
          const restoreStartedAt = Date.now();
          const projects = await listProjectsSummary();
          const projectExists = projects.some(
            (project) => project.projectName === session.projectName,
          );

          if (projectExists) {
            const projectMetadata = await fetchFullMetadata(session.projectName);
            const startupFile = session.fileId
              ? projectMetadata.treeData?.find(
                  (node) =>
                    node.data?.fileType === "file" &&
                    node.data.fileId === session.fileId,
                )
              : undefined;
            let startupFileContent: string | undefined;

            if (startupFile) {
              try {
                startupFileContent = await readFile(
                  session.projectName,
                  startupFile.data?.fileId,
                );
              } catch {
                void saveLastActiveSession({
                  location: "project",
                  projectName: session.projectName,
                });
              }
            } else if (session.fileId) {
              void saveLastActiveSession({
                location: "project",
                projectName: session.projectName,
              });
            }

            const remainingLoaderTime = Math.max(
              0,
              1000 - (Date.now() - restoreStartedAt),
            );
            if (remainingLoaderTime > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, remainingLoaderTime),
              );
            }

            setIsReady(true);
            navigate(`/projects/${encodeURIComponent(session.projectName)}`, {
              replace: true,
              state: {
                startupFileId: startupFileContent !== undefined ? session.fileId : undefined,
                startupFileContent,
                startupProjectMetadata: projectMetadata,
                startupProjectName: session.projectName,
              },
            });
            return;
          }

          setIsRestoringProject(false);
        }
      } catch (error) {
        // A stale or unreadable session must not block startup.
        setIsRestoringProject(false);
        console.warn(
          "Unable to restore the last active session; opening Projects instead.",
          error,
        );
      }

      setIsReady(true);
    }

    void restoreLastActiveSession();
  }, [navigate]);

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
                <Routes>
                  <Route
                    path="/projects/:projectName/*"
                    element={<Project />}
                  />
                  <Route
                    path="/"
                    element={
                      isReady ? <Home /> : isRestoringProject ? <Loader /> : null
                    }
                  />
                </Routes>
              </main>
            </div>
          </ProvideModal>
        </UserSettingsProvider>
      </GlobalProjectProvider>
    </ErrorProvider>
  );
}

export default App;
