import { ProjectProvider } from "gilgamesh/app/contexts/pages/ProjectProvider";
import FileSavedMessage from "./components/FileSavedMessage";
import Sidebar from "./components/SideBar";
import MainContent from "./components/MainContent";
import { ProvideModal } from "gilgamesh/app/contexts/global/ModalContext";
import { ProjectsPageWrapper } from "./components/ProjectsPageWrapper";

const ProjectsPage = async ({
  params,
}: {
  params: Promise<{ projectName: string }>;
}) => {
  const { projectName } = await params; // Await `params` before destructuring

  return (
    <ProjectProvider projectName={projectName}>
      <ProvideModal>
        <ProjectsPageWrapper>
          <FileSavedMessage />
          <Sidebar />
          <MainContent />
        </ProjectsPageWrapper>
      </ProvideModal>
    </ProjectProvider>
  );
};

export default ProjectsPage;
