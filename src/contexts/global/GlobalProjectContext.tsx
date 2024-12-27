// app/contexts/global/GlobalProjectContext.tsx

import React, { createContext, useContext, useState, ReactNode } from "react";

interface GlobalProjectContextProps {
  projectName: string | undefined;
  setProjectName: (name: string | undefined) => void;
  wordCount: number | null;
  setWordCount: (count: number | null) => void;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isBackingUp: boolean;
  setLastBackupTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setIsBackingUp: React.Dispatch<React.SetStateAction<boolean>>;
  lastBackupTime: Date | null;
}

const GlobalProjectContext = createContext<
  GlobalProjectContextProps | undefined
>(undefined);

export const GlobalProjectProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [wordCount, setWordCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null);

  return (
    <GlobalProjectContext.Provider
      value={{
        projectName,
        setProjectName,
        wordCount,
        setWordCount,
        isLoading,
        setIsLoading,
        isBackingUp,
        setLastBackupTime,
        setIsBackingUp,
        lastBackupTime,
      }}
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
