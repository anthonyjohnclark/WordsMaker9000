"use client";
import GlobalModal from "WordsMaker9000/app/components/GlobalModal";
import Loader from "WordsMaker9000/app/components/Loader";
import { useProjectContext } from "WordsMaker9000/app/contexts/pages/ProjectProvider";

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
