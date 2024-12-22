" ";
import { ReactNode } from "react";
import { ProvideModal } from "../global/ModalContext";
import { GlobalProjectProvider } from "./GlobalProjectContext";
import ErrorModal from "../../components/ErrorModal";
import { ErrorProvider } from "./ErrorContext";
import { UserSettingsProvider } from "./UserSettingsContext";

const RootProvider = ({ children }: { children: ReactNode }) => {
  return (
    <ErrorProvider>
      <GlobalProjectProvider>
        <UserSettingsProvider>
          <ErrorModal />
          <ProvideModal>{children}</ProvideModal>
        </UserSettingsProvider>
      </GlobalProjectProvider>
    </ErrorProvider>
  );
};

export default RootProvider;
