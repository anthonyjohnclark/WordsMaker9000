// context/ErrorContext.tsx
import React, { createContext, useContext, useState } from "react";

interface ErrorContextProps {
  error: Error | null | string;
  showError: (error: unknown, errorAction: string) => void;
  clearError: () => void;
  errorAction: string | null;
}

const ErrorContext = createContext<ErrorContextProps | undefined>(undefined);

export const ErrorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [error, setError] = useState<Error | null | string>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);

  const showError = (error: unknown, errorAction: string) => {
    setError(error as string);
    setErrorAction(errorAction);
  };

  const clearError = () => setError(null);

  return (
    <ErrorContext.Provider
      value={{ error, showError, clearError, errorAction }}
    >
      {children}
    </ErrorContext.Provider>
  );
};

export const useErrorContext = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useErrorContext must be used within an ErrorProvider");
  }
  return context;
};
