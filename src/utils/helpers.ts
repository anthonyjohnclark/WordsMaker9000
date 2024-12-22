import { ExtendedNodeModel } from "../types/ProjectPageTypes";

// Helper function to calculate total word count from treeData
export function calculateTreeWordCount(treeData: ExtendedNodeModel[]): number {
  return treeData
    .filter((node) => node?.data?.fileType === "file") // Only consider files
    .reduce((total, node) => total + (node?.data?.wordCount || 0), 0); // Sum word counts
}

export const convertToCurlyQuotes = (text: string) => {
  return text
    .replace(/"([^"]*)"/g, "“$1”") // Double quotes
    .replace(/'([^']*)'/g, "‘$1’") // Single quotes
    .replace(/\b'\b/g, "’") // Standalone apostrophes
    .replace(/(\w)'(\w)/g, "$1’$2"); // Apostrophes in contractions and possessives
};

export const stripHtmlTags = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return convertToCurlyQuotes(div.textContent || div.innerText || "");
};

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
