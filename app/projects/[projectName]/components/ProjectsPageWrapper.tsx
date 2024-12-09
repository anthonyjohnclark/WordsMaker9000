"use client";
import GlobalModal from "WordsMaker9000/app/components/GlobalModal";

export const ProjectsPageWrapper = ({
  children,
}: {
  children: JSX.Element | JSX.Element[];
}): JSX.Element => {
  return (
    <>
      <GlobalModal />
      <div className="flex h-full ">{children}</div>
    </>
  );
};
