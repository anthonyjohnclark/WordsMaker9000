import { useEffect, useState } from "react";
import {
  listProjectsWithMetadata,
  createProject,
  listProjectsSummary,
  ProjectType,
} from "../utils/fileManager";
import { ProjectMetadata } from "../utils/fileManager";
import Loadable from "../components/Loadable";
import { formatDateTime } from "../utils/helpers";
import { useModal } from "../contexts/global/ModalContext";
import DeleteProjectConfirmationModal from "../components/DeleteProjectConfirmationModal";
import GlobalModal from "../components/GlobalModal";
import { useErrorContext } from "../contexts/global/ErrorContext";
import ErrorModal from "../components/ErrorModal";
import { UserSettingsModal } from "../components/UserSettingsModal";
import RestoreBackupsModal from "../components/projectComponents/modals/RestoreBackupsModal";
import { FaCog } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import logo from "../assets/wordsmaker9000.png";

export default function HomePage() {
  const { showError } = useErrorContext();

  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectType, setProjectType] = useState<ProjectType | "">(""); // Default to blank

  console.log(projects);

  const isCreateDisabled = !newProjectName.trim() || !projectType; // Disable if either field is invalid

  const projectTypes: ProjectType[] = [
    "novel",
    "collection",
    "serial",
    "novella",
  ];

  const modal = useModal();

  const navigate = useNavigate();

  useEffect(() => {
    async function fetchProjects() {
      const projects = await listProjectsSummary();
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms = 1 second

      // Sort projects by lastModified in descending order
      const sortedProjects = projects.sort((a, b) => {
        const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return dateB - dateA;
      });
      setProjects(sortedProjects);
      setIsLoadingProjects(false);
    }
    fetchProjects();
  }, []);

  async function handleCreateProject() {
    try {
      if (newProjectName.trim()) {
        const trimmedName = newProjectName.trim();
        await createProject(trimmedName, projectType); // Pass projectType
        setNewProjectName("");
        setProjectType("novel"); // Reset to default type
        const updatedProjects = await listProjectsWithMetadata();
        // Sort updated projects by lastModified in descending order
        const sortedProjects = updatedProjects.sort((a, b) => {
          const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return dateB - dateA;
        });
        setProjects(sortedProjects);

        // Replace the $SELECTION_PLACEHOLDER$ with the following code
        navigate(`/projects/${trimmedName}`);
      }
    } catch (error) {
      showError(error, "creating project");
    }
  }

  const handleSetNewProjects = (deletedProject: string) => {
    setProjects((prev) =>
      prev.filter((project) => project.projectName !== deletedProject)
    );
  };

  return (
    <>
      <GlobalModal />
      <ErrorModal />

      <div className="flex flex-col h-full bg-black text-white overflow-x-hidden">
        {/* Header */}
        <header className="bg-yellow-500 text-white py-6 shadow-md">
          <div className="container mx-auto flex justify-between items-center px-6">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="WordsMaker Logo"
                className="h-11 w-12 object-contain"
              />
              <h1 className="text-3xl font-extrabold futuristic-font">
                WordsMaker9000
              </h1>
            </div>
          </div>
        </header>
        {/* Main Content */}
        <Loadable isLoading={isLoadingProjects}>
          <main className="flex-1 container mx-auto p-6">
            <h2 className="text-3xl font-bold mb-6 futuristic-font flex items-center justify-between">
              Projects
              <button
                onClick={() =>
                  modal.renderModal({
                    modalBody: (
                      <UserSettingsModal onClose={modal.handleClose} />
                    ),
                  })
                }
                className="text-white hover:text-gray-200 ml-4"
                title="Settings"
              >
                <FaCog size={24} />
              </button>
            </h2>
            <div className="bg-gray-900 p-6 rounded-lg shadow-lg mb-6">
              <h3 className="text-xl font-bold mb-4">Create New Project</h3>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New project name"
                  className="flex-1 border border-gray-700 bg-gray-900 text-white rounded p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                />
                <select
                  value={projectType}
                  onChange={(e) =>
                    setProjectType(e.target.value as ProjectType)
                  }
                  className="border border-gray-700 bg-gray-900 text-white rounded p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                >
                  <option value="" disabled>
                    Select a project type
                  </option>
                  {projectTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}{" "}
                      {/* Capitalize */}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleCreateProject}
                  className={`bg-blue-500 text-white py-2 px-4 rounded transition ${
                    isCreateDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-blue-400"
                  }`}
                  disabled={isCreateDisabled}
                >
                  Create
                </button>
              </div>
            </div>
            <ul className="mb-6 space-y-4">
              {projects.map((project) => (
                <li
                  key={project.projectName}
                  className="bg-gray-900 rounded-lg shadow-lg p-2 relative hover:bg-gray-700 transition"
                >
                  {/* Project Link */}
                  <div className="mt-2 text-sm pb-2 text-gray-400 flex justify-between items-center">
                    <div>
                      <a
                        href={`/projects/${project.projectName}`}
                        className="text-xl font-semibold text-blue-400 hover:underline futuristic-font"
                      >
                        {decodeURIComponent(project.projectName)}
                      </a>

                      <p>
                        <span className="font-semibold text-gray-300">
                          Type:
                        </span>{" "}
                        <span className="text-yellow-500">
                          {project.projectType}
                        </span>
                      </p>
                      <p>
                        <span className="font-semibold text-gray-300">
                          Created:
                        </span>{" "}
                        <span className="text-green-500">
                          {formatDateTime(project.createDate)}
                        </span>
                      </p>
                      <p>
                        <span className="font-semibold text-gray-300">
                          Last Edited:
                        </span>{" "}
                        <span className="text-green-500">
                          {formatDateTime(project.lastModified ?? "")}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col space-y-2 items-end">
                      <p>
                        <span className="font-semibold text-gray-300">
                          Word Count:
                        </span>{" "}
                        <span className="text-blue-500">
                          {project.wordCount}
                        </span>
                      </p>

                      <button
                        onClick={() => {
                          modal.renderModal({
                            modalBody: (
                              <DeleteProjectConfirmationModal
                                projectName={project.projectName}
                                onCancel={modal.handleClose}
                                handleSetNewProjects={handleSetNewProjects}
                              />
                            ),
                          });
                        }}
                        className="bg-red-500 text-white p-1 rounded-lg w-24 text-center mt-4"
                        title="Delete Project"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => {
                          modal.renderModal({
                            modalBody: (
                              <RestoreBackupsModal
                                projectName={project.projectName}
                                onRestoreSuccess={async () => {
                                  // Refresh projects list after restore
                                  const updatedProjects =
                                    await listProjectsSummary();
                                  const sortedProjects = updatedProjects.sort(
                                    (a, b) => {
                                      const dateA = a.lastModified
                                        ? new Date(a.lastModified).getTime()
                                        : 0;
                                      const dateB = b.lastModified
                                        ? new Date(b.lastModified).getTime()
                                        : 0;
                                      return dateB - dateA;
                                    }
                                  );
                                  setProjects(sortedProjects);
                                  modal.handleClose();
                                }}
                              />
                            ),
                          });
                        }}
                        className="bg-yellow-500 text-white p-1 rounded-lg w-24 text-center mt-4"
                        title="Restore Project"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </main>
        </Loadable>
        {/* Footer */}
        <footer className="bg-gray-900 text-gray-400 py-4">
          <div className="container mx-auto text-center">
            © {new Date().getFullYear()} WordsMaker9000 - All Rights Reserved
          </div>
        </footer>
      </div>
    </>
  );
}
