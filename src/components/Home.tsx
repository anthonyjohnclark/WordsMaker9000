import { useEffect, useState } from "react";
import {
  listProjectsWithMetadata,
  createProject,
  listProjectsSummary,
  ProjectType,
  saveLastActiveSession,
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
import { useNavigate, Link } from "react-router-dom";
import { FiEdit2, FiTrash2, FiRotateCcw, FiSettings } from "react-icons/fi";
import EditProjectTypeModal from "./EditProjectTypeModal";

export default function HomePage() {
  const { showError } = useErrorContext();

  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectType, setProjectType] = useState<ProjectType | "">(""); // Default to blank

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
    void saveLastActiveSession({ location: "home" });
  }, []);

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

  const handleUpdateProjectType = (
    projectName: string,
    newType: ProjectType,
  ) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.projectName === projectName
          ? { ...project, projectType: newType }
          : project,
      ),
    );
  };

  return (
    <>
      <GlobalModal />
      <ErrorModal />

      <div
        className="projects-page flex flex-col h-full overflow-hidden"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <header
          className="py-6"
          style={{
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="container mx-auto flex justify-between items-center px-6">
            <h1 className="text-3xl font-normal futuristic-font">
              Projects
            </h1>
            <button
              onClick={() =>
                modal.renderModal({
                  modalBody: <UserSettingsModal onClose={modal.handleClose} />,
                })
              }
              className="project-icon-button p-2"
              aria-label="Settings"
              title="Settings"
            >
              <FiSettings size={20} />
            </button>
          </div>
        </header>
        {/* Main Content */}
        <Loadable isLoading={isLoadingProjects}>
          <main className="flex-1 container mx-auto p-6 flex flex-col overflow-hidden">
            <div
              className="p-6 rounded-lg border mb-6"
              style={{ background: "var(--card-bg)", borderColor: "var(--border-color)" }}
            >
              <h3 className="text-sm font-medium mb-4">Create New Project</h3>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New project name"
                  className="project-control flex-1 border px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--border-color)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={projectType}
                  onChange={(e) =>
                    setProjectType(e.target.value as ProjectType)
                  }
                  className="project-control border px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--border-color)",
                    background: "var(--bg-input)",
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
                  className="project-control project-create-button py-2 px-4 text-sm font-medium"
                  style={{
                    background: "var(--accent-bg)",
                    color: "var(--accent-text)",
                  }}
                  disabled={isCreateDisabled}
                >
                  Create
                </button>
              </div>
            </div>
            <ul className="mb-6 space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {projects.map((project) => (
                <li
                  key={project.projectName}
                  className="rounded-lg border px-4 py-3 relative transition-colors"
                  style={{ background: "var(--card-bg)", borderColor: "var(--border-color)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--card-bg)")
                  }
                >
                  {/* Top row: project name + action icons */}
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/projects/${project.projectName}`}
                      className="project-name text-xl font-normal hover:underline futuristic-font"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {decodeURIComponent(project.projectName)}
                    </Link>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          modal.renderModal({
                            modalBody: (
                              <RestoreBackupsModal
                                projectName={project.projectName}
                                onRestoreSuccess={async () => {
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
                        className="project-icon-button p-1.5"
                        aria-label="Restore Backup"
                        title="Restore Backup"
                      >
                        <FiRotateCcw size={16} />
                      </button>
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
                        className="project-icon-button project-delete-button p-1.5"
                        aria-label="Delete Project"
                        title="Delete Project"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Bottom row: metadata in a horizontal line */}
                  <div
                    className="project-metadata flex items-center flex-wrap gap-x-4 gap-y-1 mt-1 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span className="flex items-center space-x-1">
                      <span
                        className="font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Type:
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {project.projectType}
                      </span>
                      <button
                        onClick={() => {
                          modal.renderModal({
                            modalBody: (
                              <EditProjectTypeModal
                                projectName={project.projectName}
                                currentType={project.projectType}
                                onSuccess={(newType) =>
                                  handleUpdateProjectType(
                                    project.projectName,
                                    newType,
                                  )
                                }
                              />
                            ),
                          });
                        }}
                        className="project-icon-button p-0.5"
                        style={{ color: "var(--text-secondary)" }}
                        title="Edit Project Type"
                      >
                        <FiEdit2 size={12} />
                      </button>
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--border-color)" }}
                    >
                      |
                    </span>
                    <span>
                      <span
                        className="font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Created:
                      </span>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {formatDateTime(project.createDate)}
                      </span>
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--border-color)" }}
                    >
                      |
                    </span>
                    <span>
                      <span
                        className="font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Edited:
                      </span>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {formatDateTime(project.lastModified ?? "")}
                      </span>
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--border-color)" }}
                    >
                      |
                    </span>
                    <span>
                      <span
                        className="font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Words:
                      </span>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {project.wordCount}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </main>
        </Loadable>
        {/* Footer */}
        <footer
          className="h-8 border-t"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-secondary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="h-full px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-left">
              <svg
                className="w-5 h-5 shrink-0"
                viewBox="0 0 500 500"
                aria-hidden="true"
                focusable="false"
                style={
                  {
                    "--wm-logo-background": "var(--bg-primary)",
                    "--wm-logo-ink": "var(--accent)",
                    "--wm-logo-lettering": "var(--text-primary)",
                    "--wm-logo-outline": "var(--bg-primary)",
                  } as React.CSSProperties
                }
              >
                <use href="/wordsmaker9000.svg#wordsmaker9000-logo" />
              </svg>
              <span className="text-sm">
                © {new Date().getFullYear()} WordsMaker9000
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              v{__APP_VERSION__}
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
