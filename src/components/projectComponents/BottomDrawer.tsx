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
        const height = entry.contentRect.height;
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
      className="absolute bottom-0 left-0 right-0 overflow-hidden max-h-12"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header Row */}
      <div
        className="flex items-center justify-between p-2 border-t"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center space-x-4">
          <span className="text-sm">
            <span className="font-bold">Created:</span>{" "}
            <span style={{ color: "var(--btn-success)" }}>
              {project?.selectedFile?.data?.createDate &&
                formatDateTime(project.selectedFile.data.createDate)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Last Edited:</span>{" "}
            <span style={{ color: "var(--btn-success)" }}>
              {project?.selectedFile?.data?.lastModified &&
                formatDateTime(project.selectedFile.data.lastModified)}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-bold">Word Count:</span>{" "}
            <span style={{ color: "var(--btn-primary)" }}>
              {project?.selectedFile?.data?.wordCount}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default BottomDrawer;
