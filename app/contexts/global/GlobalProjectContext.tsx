// app/contexts/global/GlobalProjectContext.tsx
"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface GlobalProjectContextProps {
  projectName: string | null;
  setProjectName: (name: string | null) => void;
  wordCount: number | null;
  setWordCount: (count: number | null) => void;
}

const GlobalProjectContext = createContext<
  GlobalProjectContextProps | undefined
>(undefined);

export const GlobalProjectProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [projectName, setProjectName] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState<number | null>(null);

  return (
    <GlobalProjectContext.Provider
      value={{ projectName, setProjectName, wordCount, setWordCount }}
    >
      {children}
    </GlobalProjectContext.Provider>
  );
};

export const useGlobalProjectContext = () => {
  const context = useContext(GlobalProjectContext);
  if (!context) {
    throw new Error(
      "useGlobalProjectContext must be used within a GlobalProjectProvider"
    );
  }
  return context;
};
