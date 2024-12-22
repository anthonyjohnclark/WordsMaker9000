" ";

import React, { useState } from "react";
import { AIProvider } from "../../contexts/pages/AIContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import Loadable from "../Loadable";
import BottomDrawer from "./BottomDrawer";
import TextEditor from "./TextEditor";

const Editor: React.FC = () => {
  const project = useProjectContext();
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

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
                className="w-full text-2xl font-semibold text-white bg-black p-2 rounded focus:outline-none focus:ring focus:ring-blue-500"
              />
            </div>

            {/* Scrollable TextEditor */}
            <div
              className="flex-1 overflow-y-scroll relative h-full scrollbar-hide"
              style={{
                marginBottom: isDrawerExpanded ? "12rem" : "3rem", // Padding ensures the child adjusts dynamically
              }}
            >
              <TextEditor
                key={project.selectedFile?.id}
                selectedFile={project.selectedFile}
                isDrawerExpanded={isDrawerExpanded}
              />
            </div>
          </div>
          {/* Fixed Bottom Drawer */}
          <BottomDrawer onStateChange={setIsDrawerExpanded} />
        </div>
      </Loadable>
    </AIProvider>
  );
};

export default Editor;
