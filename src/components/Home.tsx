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
import { useNavigate, Link } from "react-router-dom";

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
      prev.filter((project) => project.projectName !== deletedProject),
    );
  };

  return (
    <>
      <GlobalModal />
      <ErrorModal />

      <div
        className="flex flex-col h-full overflow-hidden"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <header
          className="py-6 shadow-md"
          style={{
            background: "var(--accent-bg)",
            color: "var(--bg-primary)",
          }}
        >
          <div className="container mx-auto flex justify-between items-center px-6">
            <h1 className="text-3xl font-extrabold futuristic-font">
              Projects
            </h1>
            <button
              onClick={() =>
                modal.renderModal({
                  modalBody: <UserSettingsModal onClose={modal.handleClose} />,
                })
              }
              style={{ color: "var(--bg-primary)" }}
              title="Settings"
            >
              <FaCog size={24} />
            </button>
          </div>
        </header>
        {/* Main Content */}
        <Loadable isLoading={isLoadingProjects}>
          <main className="flex-1 container mx-auto p-6 flex flex-col overflow-hidden">
            <div
              className="p-6 rounded-lg shadow-lg mb-6"
              style={{ background: "var(--card-bg)" }}
            >
              <h3 className="text-xl font-bold mb-4">Create New Project</h3>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New project name"
                  className="flex-1 border rounded p-2 focus:outline-none"
                  style={{
                    borderColor: "var(--border-color)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={projectType}
                  onChange={(e) =>
                    setProjectType(e.target.value as ProjectType)
                  }
                  className="border rounded p-2 focus:outline-none"
                  style={{
                    borderColor: "var(--border-color)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
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
                  className={`py-2 px-4 rounded transition ${
                    isCreateDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  style={{
                    background: "var(--btn-primary)",
                    color: "var(--btn-text)",
                  }}
                  disabled={isCreateDisabled}
                >
                  Create
                </button>
              </div>
            </div>
            <ul className="mb-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              {projects.map((project) => (
                <li
                  key={project.projectName}
                  className="rounded-lg shadow-lg p-2 relative transition"
                  style={{ background: "var(--card-bg)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--card-bg)")
                  }
                >
                  {/* Project Link */}
                  <div
                    className="mt-2 text-sm pb-2 flex justify-between items-center"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <div>
                      <Link
                        to={`/projects/${project.projectName}`}
                        className="text-xl font-semibold hover:underline futuristic-font"
                        style={{ color: "var(--btn-primary)" }}
                      >
                        {decodeURIComponent(project.projectName)}
                      </Link>

                      <p>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Type:
                        </span>{" "}
                        <span style={{ color: "var(--accent)" }}>
                          {project.projectType}
                        </span>
                      </p>
                      <p>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Created:
                        </span>{" "}
                        <span style={{ color: "var(--btn-success)" }}>
                          {formatDateTime(project.createDate)}
                        </span>
                      </p>
                      <p>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Last Edited:
                        </span>{" "}
                        <span style={{ color: "var(--btn-success)" }}>
                          {formatDateTime(project.lastModified ?? "")}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col space-y-2 items-end">
                      <p>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Word Count:
                        </span>{" "}
                        <span style={{ color: "var(--btn-primary)" }}>
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
                        className="p-1 rounded-lg w-24 text-center mt-4"
                        style={{
                          background: "var(--btn-danger)",
                          color: "var(--btn-text)",
                        }}
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
                                    },
                                  );
                                  setProjects(sortedProjects);
                                  modal.handleClose();
                                }}
                              />
                            ),
                          });
                        }}
                        className="p-1 rounded-lg w-24 text-center mt-4"
                        style={{
                          background: "var(--accent-bg)",
                          color: "var(--accent-text)",
                        }}
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
        <footer
          className="py-4"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-secondary)",
          }}
        >
          <div className="container mx-auto text-center">
            © {new Date().getFullYear()} WordsMaker9000 - All Rights Reserved
          </div>
        </footer>
      </div>
    </>
  );
}
