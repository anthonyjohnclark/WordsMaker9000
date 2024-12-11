// components/Loadable.tsx
import React from "react";
import Loader from "WordsMaker9000/app/components/Loader";

interface LoadableProps {
  isLoading: boolean;
  loader?: React.ReactNode; // Optional custom loader component
  children: React.ReactNode; // Content to render when not loading
}

const Loadable: React.FC<LoadableProps> = ({ isLoading, loader, children }) => {
  if (isLoading) {
    return <>{loader || <Loader />}</>; // Render the loader or default loader
  }
  return <>{children}</>; // Render children if not loading
};

export default Loadable;
