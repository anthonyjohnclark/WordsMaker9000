import React, { useState } from "react";
import { FiFileText } from "react-icons/fi";
import { EditorProvider } from "../../contexts/pages/EditorContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import Loadable from "../Loadable";
import BottomDrawer from "./BottomDrawer";
import TextEditor from "./TextEditor";

const EditorView: React.FC<{ isEditorActive?: boolean }> = ({
  isEditorActive = true,
}) => {
  const project = useProjectContext();
  const [drawerHeight, setDrawerHeight] = useState(48);

  const handleDrawerStateChange = (_isExpanded: boolean, height: number) => {
    setDrawerHeight(height);
  };

  return (
    <EditorProvider isActive={isEditorActive}>
      <Loadable isLoading={project.isEditorLoading}>
        <div className="relative flex flex-col h-full">
          {/* Header */}
          <div className="relative flex flex-col h-full">
            {/* Slot for the in-file find bar, aligned with the title input */}
            <div id="findbar-slot" className="absolute top-3 right-5 z-50" />
            <div className="mx-5 mb-0 flex items-center justify-between pb-2 pt-2">
              <FiFileText
                aria-hidden="true"
                size={22}
                className="mr-2 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <input
                type="text"
                value={project.selectedFile?.text || ""}
                onChange={(e) => project.handleFileNameChange(e.target.value)}
                className="min-w-0 flex-1 text-2xl font-semibold p-2 rounded focus:outline-none"
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
                isActive={isEditorActive}
              />
            </div>
          </div>
          <BottomDrawer onStateChange={handleDrawerStateChange} />
        </div>
      </Loadable>
    </EditorProvider>
  );
};

export default EditorView;
