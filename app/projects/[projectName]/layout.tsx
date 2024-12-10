// app/projects/[projectName]/layout.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { use } from "react";
import { useGlobalProjectContext } from "WordsMaker9000/app/contexts/global/GlobalProjectContext";
import {
  ProjectProvider,
  useProjectContext,
} from "WordsMaker9000/app/contexts/pages/ProjectProvider";

export default function ProjectLayout({
  children,
  params: asyncParams,
}: {
  children: ReactNode;
  params: Promise<{ projectName: string }>;
}) {
  const params = use(asyncParams); // Await the params
  const { projectName } = params;
  const { setProjectName, setWordCount } = useGlobalProjectContext();

  useEffect(() => {
    setProjectName(projectName);

    // Cleanup when navigating away
    return () => {
      setProjectName(null);
      setWordCount(null); // Reset word count when navigating away
    };
  }, [projectName, setProjectName, setWordCount]);

  return (
    <ProjectProvider projectName={projectName}>
      <WordCountUpdater /> {/* Keeps GlobalProjectContext updated */}
      {children}
    </ProjectProvider>
  );
}

// Component to keep wordCount updated in GlobalProjectContext
const WordCountUpdater = () => {
  const { projectMetadata } = useProjectContext();
  const { setWordCount } = useGlobalProjectContext();

  useEffect(() => {
    setWordCount(projectMetadata.wordCount);
  }, [projectMetadata.wordCount, setWordCount]);

  return null; // No UI, just updates context
};
