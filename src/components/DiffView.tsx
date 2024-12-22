import React, { useCallback, useEffect } from "react";
import { useAIContext } from "../contexts/pages/AIContext";
import { stripHtmlTags } from "../utils/helpers";

const DiffView: React.FC = () => {
  const { setMergedContent, diff, setDiff } = useAIContext();

  const updateMergedContent = useCallback(() => {
    const merged = diff
      .filter((part) => part.accepted)
      .map((part) => part.value)
      .join("");
    setMergedContent(merged);
  }, [diff, setMergedContent]);

  useEffect(() => {
    updateMergedContent();
  }, [updateMergedContent]);

  const handleToggle = (index: number) => {
    const updatedChanges = [...diff];
    const clickedPart = updatedChanges[index];

    // Toggle `accepted` for the clicked part
    clickedPart.accepted = !clickedPart.accepted;

    // Toggle `accepted` for the linked part using its index
    if (
      clickedPart.linkedToIndex !== null &&
      clickedPart.linkedToIndex !== undefined
    ) {
      const linkedIndex = clickedPart.linkedToIndex;
      updatedChanges[linkedIndex].accepted = !clickedPart.accepted;
    }

    // Update state to trigger re-render
    setDiff(updatedChanges);
  };

  return (
    <div className="ql-editor">
      <div
        style={{
          marginTop: "41px",
          border: diff.length > 0 ? "5px solid #4ADE80" : "none",
          paddingLeft: "10px",
          paddingRight: "10px",
        }}
      >
        {diff.map((part, index) => (
          <span
            key={index}
            style={{
              backgroundColor: part.added
                ? "lightgreen"
                : part.removed
                ? "lightcoral"
                : "transparent",
              textDecoration:
                part.removed && !part.accepted ? "line-through" : "none",
              cursor: part.unclickable ? "default" : "pointer", // Disable pointer
              opacity: part.accepted ? 1 : 0.5,
            }}
            onClick={() => {
              if (!part.unclickable) handleToggle(index);
            }} // Only toggle if clickable
          >
            {stripHtmlTags(part.value)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default DiffView;
