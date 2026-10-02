import React, { useEffect, useRef } from "react";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { formatDateTime } from "../../utils/helpers";

type BottomDrawerProps = {
  onStateChange: (isExpanded: boolean, height: number) => void;
};

const BottomDrawer: React.FC<BottomDrawerProps> = ({ onStateChange }) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  const project = useProjectContext();

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const height = entry.target.getBoundingClientRect().height;
        onStateChange(false, height); // Notify parent of height changes
      }
    });

    if (drawerRef.current) {
      observer.observe(drawerRef.current);
    }

    return () => {
      if (drawerRef.current) {
        observer.unobserve(drawerRef.current);
      }
    };
  }, [onStateChange]);

  return (
    <div
      ref={drawerRef}
      className="editor-status absolute bottom-0 left-0 right-0 px-5 pb-2"
      style={{ color: "var(--text-secondary)" }}
    >
      {/* Header Row */}
      <div
        className="editor-status-surface flex min-h-[42px] items-center justify-between px-4 py-2"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="flex items-center space-x-4">
          <span className="text-xs">
            <span className="font-normal">Created:</span>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {project?.selectedFile?.data?.createDate &&
                formatDateTime(project.selectedFile.data.createDate)}
            </span>
          </span>
          <span className="text-xs">
            <span className="font-normal">Last Edited:</span>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {project?.selectedFile?.data?.lastModified &&
                formatDateTime(project.selectedFile.data.lastModified)}
            </span>
          </span>

        </div>
        <span className="ml-auto shrink-0 pl-4 text-right text-xs">
          {project?.selectedFile?.data?.wordCount ?? 0} words
        </span>
      </div>
    </div>
  );
};

export default BottomDrawer;
