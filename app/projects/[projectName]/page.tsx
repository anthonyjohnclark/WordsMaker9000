import FileSavedMessage from "./components/FileSavedMessage";
import Sidebar from "./components/SideBar";
import MainContent from "./components/MainContent";
import { ProjectsPageModalWrapper } from "./components/ProjectsPageModalWrapper";

const ProjectsPage = () => {
  return (
    <ProjectsPageModalWrapper>
      <FileSavedMessage />
      <Sidebar />
      <MainContent />
    </ProjectsPageModalWrapper>
  );
};

export default ProjectsPage;
