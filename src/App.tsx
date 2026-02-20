import { Route, Routes } from "react-router-dom";
import TitleBar from "./components/TitleBar";
import Home from "./components/Home";
import Project from "./components/Project";
import ErrorModal from "./components/ErrorModal";
import { ErrorProvider } from "./contexts/global/ErrorContext";
import { GlobalProjectProvider } from "./contexts/global/GlobalProjectContext";
import { ProvideModal } from "./contexts/global/ModalContext";
import { UserSettingsProvider } from "./contexts/global/UserSettingsContext";

function App() {
  return (
    <ErrorProvider>
      <GlobalProjectProvider>
        <UserSettingsProvider>
          <ErrorModal />
          <ProvideModal>
            <div className="grid grid-rows-[auto,1fr] h-screen">
              <TitleBar /> {/* Always present */}
              <main
                className="overflow-hidden"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                <Routes>
                  {" "}
                  <Route path="/projects/:projectName" element={<Project />} />
                  <Route path="/" element={<Home />} />
                </Routes>
              </main>
            </div>
          </ProvideModal>
        </UserSettingsProvider>
      </GlobalProjectProvider>
    </ErrorProvider>
  );
}

export default App;
