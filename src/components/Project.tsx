import { useEffect } from "react";
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
import { useParams } from "react-router-dom";

export default function Project() {
  const projectName = useParams().projectName ?? "";

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

  return (
    <ProjectProvider projectName={projectName}>
      <TitleBarUpdater /> {/* Keeps GlobalProjectContext updated */}
      <SearchReplaceModal />
      <ProjectsPageModalWrapper>
        <FileSavedMessage />
        <Sidebar />
        <MainContent />
      </ProjectsPageModalWrapper>
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
