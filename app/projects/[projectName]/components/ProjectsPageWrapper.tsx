"use client";
import GlobalModal from "gilgamesh/app/components/GlobalModal";

export const ProjectsPageWrapper = ({
  children,
}: {
  children: JSX.Element | JSX.Element[];
}): JSX.Element => {
  return (
    <>
      <GlobalModal />
      <div className="flex h-screen">{children}</div>
    </>
  );
};
