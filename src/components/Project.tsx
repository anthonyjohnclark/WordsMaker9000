import { useEffect, useState } from "react";
import { ProjectsPageModalWrapper } from "./projectComponents/ProjectsPageModalWrapper";
import FileSavedMessage from "./projectComponents/FileSavedMessage";
import MainContent from "./projectComponents/MainContent";
import { useGlobalProjectContext } from "../contexts/global/GlobalProjectContext";
import {
  ProjectProvider,
  useProjectContext,
} from "../contexts/pages/ProjectProvider";
import Sidebar from "./projectComponents/SideBar";
import SearchReplaceModal from "./projectComponents/modals/SearchReplaceModal";
import { useLocation, useParams } from "react-router-dom";
import PublishingWorkspace from "./publishing/PublishingWorkspace";

export default function Project() {
  const projectName = useParams().projectName ?? "";
  const location = useLocation();
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

    // Cleanup when navigating away
    return () => {
      setProjectName("");
      setWordCount(null); // Reset word count when navigating away
      setLastBackupTime(null);
      setIsSearchOpen(false);
    };
  }, [
    projectName,
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
    <ProjectProvider key={projectName} projectName={projectName}>
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
