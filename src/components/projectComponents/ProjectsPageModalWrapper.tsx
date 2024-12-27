import GlobalModal from "../../components/GlobalModal";
import Loader from "../../components/Loader";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";

export const ProjectsPageModalWrapper = ({
  children,
}: {
  children: JSX.Element | JSX.Element[];
}): JSX.Element => {
  const project = useProjectContext();

  return project.isProjectPageLoading ? (
    <Loader />
  ) : (
    <>
      <GlobalModal />
      <div className="flex h-full ">{children}</div>
    </>
  );
};
