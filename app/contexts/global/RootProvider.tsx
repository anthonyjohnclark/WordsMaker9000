"use client";
import { ReactNode } from "react";
import { ProvideModal } from "../global/ModalContext";
import { GlobalProjectProvider } from "./GlobalProjectContext";
import ErrorModal from "WordsMaker9000/app/components/ErrorModal";
import { ErrorProvider } from "./ErrorContext";

const RootProvider = ({ children }: { children: ReactNode }) => {
  return (
    <ErrorProvider>
      <GlobalProjectProvider>
        <ErrorModal />
        <ProvideModal>{children}</ProvideModal>
      </GlobalProjectProvider>
    </ErrorProvider>
  );
};

export default RootProvider;
