import React, { useState } from "react";
import { AIProvider } from "../../contexts/pages/AIContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import Loadable from "../Loadable";
import BottomDrawer from "./BottomDrawer";
import TextEditor from "./TextEditor";

const Editor: React.FC = () => {
  const project = useProjectContext();
  const [drawerHeight, setDrawerHeight] = useState(48); // Default height for collapsed drawer

  const handleDrawerStateChange = (_: boolean, height: number) => {
    setDrawerHeight(height); // Update the drawer height dynamically
  };

  return (
    <AIProvider>
      <Loadable isLoading={project.isEditorLoading}>
        <div className="relative flex flex-col h-full">
          {/* Header */}
          <div className="relative flex flex-col pl-5 pr-5 h-full">
            <div className="mb-0 flex items-center justify-between border-b pb-2 pt-2">
              <input
                type="text"
                value={project.selectedFile?.text || ""}
                onChange={(e) => project.handleFileNameChange(e.target.value)}
                className="w-full text-2xl font-semibold p-2 rounded focus:outline-none"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Scrollable TextEditor */}
            <div
              className="flex-1 overflow-y-scroll relative h-full scrollbar-hide"
              style={{
                marginBottom: `${drawerHeight}px`, // Use dynamic drawer height
              }}
            >
              <TextEditor
                key={project.selectedFile?.id}
                selectedFile={project.selectedFile}
                isDrawerExpanded={drawerHeight > 48} // Example condition
              />
            </div>
          </div>
          {/* Fixed Bottom Drawer */}
          <BottomDrawer onStateChange={handleDrawerStateChange} />
        </div>
      </Loadable>
    </AIProvider>
  );
};

export default Editor;
