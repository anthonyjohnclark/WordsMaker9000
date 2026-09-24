import { useEffect, useState } from "react";
import { ProjectsPageModalWrapper } from "./projectComponents/ProjectsPageModalWrapper";
import FileSavedMessage from "./projectComponents/FileSavedMessage";
import MainContent from "./projectComponents/MainContent";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import {
  ProjectProvider,
  useProjectContext,
} from "../contexts/pages/ProjectProvider";
import { ProjectMetadata, saveLastActiveSession } from "../utils/fileManager";
import Sidebar from "./projectComponents/SideBar";
import SearchReplaceModal from "./projectComponents/modals/SearchReplaceModal";
import { useLocation, useParams } from "react-router-dom";
import PublishingWorkspace from "./publishing/PublishingWorkspace";

type StartupProjectState = {
  startupFileId?: unknown;
  startupFileContent?: unknown;
  startupProjectMetadata?: unknown;
  startupProjectName?: unknown;
};

export default function Project() {
  const projectName = useParams().projectName ?? "";
  const location = useLocation();
  const startupState = location.state as StartupProjectState | null;
  const {
    startupFileId,
    startupFileContent,
    startupProjectMetadata,
    startupProjectName,
  } = startupState ?? {};
  const isStartupRestoreForProject =
    typeof startupProjectName === "string" &&
    startupProjectName === decodeURIComponent(projectName);
  const initialFileId =
    isStartupRestoreForProject && typeof startupFileId === "string"
      ? startupFileId
      : undefined;
  const isPublishRoute = location.pathname.endsWith("/publish");
  const isArtifactsRoute = location.pathname.endsWith("/artifacts");
  const isPublishingWorkspaceRoute = isPublishRoute || isArtifactsRoute;
  const [publishMounted, setPublishMounted] = useState(
    isPublishingWorkspaceRoute,
  );

  const { setProjectName, setWordCount, setLastBackupTime, setIsSearchOpen } =
    useGlobalProjectContext();

  useEffect(() => {
    setProjectName(projectName);

    if (!isStartupRestoreForProject) {
      void saveLastActiveSession({
        location: "project",
        projectName: decodeURIComponent(projectName),
      });
    }

    // Cleanup when navigating away
    return () => {
      setProjectName("");
      setWordCount(null); // Reset word count when navigating away
      setLastBackupTime(null);
      setIsSearchOpen(false);
    };
  }, [
    projectName,
    isStartupRestoreForProject,
    setLastBackupTime,
    setProjectName,
    setWordCount,
    setIsSearchOpen,
  ]);

  useEffect(() => {
    if (isPublishingWorkspaceRoute) {
      setPublishMounted(true);
      setIsSearchOpen(false);
    }
  }, [isPublishingWorkspaceRoute, setIsSearchOpen]);

  return (
    <ProjectProvider
      key={projectName}
      projectName={projectName}
      initialFileId={initialFileId}
      initialFileContent={
        isStartupRestoreForProject && typeof startupFileContent === "string"
          ? startupFileContent
          : undefined
      }
      initialProjectMetadata={
        isStartupRestoreForProject && startupProjectMetadata
          ? (startupProjectMetadata as ProjectMetadata)
          : undefined
      }
    >
      <TitleBarUpdater /> {/* Keeps GlobalProjectContext updated */}
      {!isPublishingWorkspaceRoute && <SearchReplaceModal />}
      <div className="relative h-full">
        <div
          className={isPublishingWorkspaceRoute ? "hidden" : "block h-full"}
          aria-hidden={isPublishingWorkspaceRoute}
        >
          <ProjectsPageModalWrapper>
            <FileSavedMessage />
            <Sidebar />
            <MainContent isEditorActive={!isPublishingWorkspaceRoute} />
          </ProjectsPageModalWrapper>
        </div>
        <div
          className={isPublishingWorkspaceRoute ? "block h-full" : "hidden"}
          aria-hidden={!isPublishingWorkspaceRoute}
        >
          {publishMounted && <PublishingWorkspace />}
        </div>
      </div>
    </ProjectProvider>
  );
}

// Component to keep wordCount updated in GlobalProjectContext
const TitleBarUpdater = () => {
  const { projectMetadata, isProjectPageLoading, isBackingUp } =
    useProjectContext();
  const { setWordCount, setIsLoading, setIsBackingUp, setLastBackupTime } =
    useGlobalProjectContext();

  useEffect(() => {
    setWordCount(projectMetadata.wordCount);
    setIsLoading(isProjectPageLoading);
    setIsBackingUp(isBackingUp);
    setLastBackupTime(projectMetadata.lastBackedUp);
  }, [
    projectMetadata.wordCount,
    isProjectPageLoading,
    isBackingUp,
    setWordCount,
    setIsLoading,
    setIsBackingUp,
    setLastBackupTime,
    projectMetadata.lastBackedUp,
  ]);

  return null; // No UI, just updates context
};
