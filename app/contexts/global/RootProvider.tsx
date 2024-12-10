"use client";
import { ReactNode } from "react";
import { ProvideModal } from "../global/ModalContext";
import { GlobalProjectProvider } from "./GlobalProjectContext";

const RootProvider = ({ children }: { children: ReactNode }) => {
  return (
    <GlobalProjectProvider>
      <ProvideModal>{children}</ProvideModal>
    </GlobalProjectProvider>
  );
};

export default RootProvider;
