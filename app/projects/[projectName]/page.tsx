import ProjectPageClient from "./ProjectPageClient";

const ProjectsPage = async ({
  params,
}: {
  params: Promise<{ projectName: string }>;
}) => {
  const { projectName } = await params; // Await `params` before destructuring

  return <ProjectPageClient projectName={projectName} />;
};

export default ProjectsPage;
