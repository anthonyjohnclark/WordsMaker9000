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
  const { setProjectName, setWordCount, setLastBackupTime } =
    useGlobalProjectContext();

  useEffect(() => {
    setProjectName(projectName);

    // Cleanup when navigating away
    return () => {
      setProjectName(null);
      setWordCount(null); // Reset word count when navigating away
      setLastBackupTime(null);
    };
  }, [projectName, setLastBackupTime, setProjectName, setWordCount]);

  return (
    <ProjectProvider projectName={projectName}>
      <TitleBarUpdater /> {/* Keeps GlobalProjectContext updated */}
      {children}
    </ProjectProvider>
  );
}

// Component to keep wordCount updated in GlobalProjectContext
const TitleBarUpdater = () => {
  const { projectMetadata, isProjectPageLoading, isBackingUp, lastBackupTime } =
    useProjectContext();
  const { setWordCount, setIsLoading, setIsBackingUp, setLastBackupTime } =
    useGlobalProjectContext();

  useEffect(() => {
    setWordCount(projectMetadata.wordCount);
    setIsLoading(isProjectPageLoading);
    setIsBackingUp(isBackingUp);
    setLastBackupTime(lastBackupTime ?? projectMetadata.lastBackedUp);
  }, [
    projectMetadata.wordCount,
    isProjectPageLoading,
    isBackingUp,
    lastBackupTime,
    setWordCount,
    setIsLoading,
    setIsBackingUp,
    setLastBackupTime,
    projectMetadata.lastBackedUp,
  ]);

  return null; // No UI, just updates context
};
