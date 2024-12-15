import { ExtendedNodeModel } from "../projects/[projectName]/types/ProjectPageTypes";

// Helper function to calculate total word count from treeData
export function calculateTreeWordCount(treeData: ExtendedNodeModel[]): number {
  return treeData
    .filter((node) => node?.data?.fileType === "file") // Only consider files
    .reduce((total, node) => total + (node?.data?.wordCount || 0), 0); // Sum word counts
}

export const formatDateTime = (dateString: string | Date): string => {
  if (!dateString) {
    return ""; // Placeholder for null
  }

  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};
