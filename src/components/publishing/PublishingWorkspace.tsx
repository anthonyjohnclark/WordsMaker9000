import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PublishingPage from "./PublishingPage";
import ExportVersionsModal from "../projectComponents/modals/ExportVersionsModal";

const PublishingWorkspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectName = "" } = useParams();
  const [artifactRefreshToken, setArtifactRefreshToken] = useState(0);
  const isArtifactsPage = location.pathname.endsWith("/artifacts");

  const goToEditor = () => {
    navigate(`/projects/${encodeURIComponent(projectName)}`);
  };

  const goToArtifacts = () => {
    navigate(`/projects/${encodeURIComponent(projectName)}/artifacts`);
  };

  return (
    <section
      className="h-full min-h-0 flex flex-col"
      style={{
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
      }}
    >
      <div className="relative flex-1 min-h-0 overflow-y-auto px-5 py-8 sm:px-8">
        <div className={isArtifactsPage ? "hidden" : "block min-h-full"}>
          <PublishingPage
            onNavigateEditor={goToEditor}
            onOpenArtifactHistory={goToArtifacts}
            onPublishComplete={() =>
              setArtifactRefreshToken((value) => value + 1)
            }
          />
        </div>
        <div className={isArtifactsPage ? "block min-h-full" : "hidden"}>
          <ExportVersionsModal
            projectName={projectName}
            mode="page"
            onArtifactsChanged={() =>
              setArtifactRefreshToken((value) => value + 1)
            }
            key={`history-${artifactRefreshToken}`}
          />
        </div>
      </div>
    </section>
  );
};

export default PublishingWorkspace;
