import { ExtendedNodeModel } from "../types/ProjectPageTypes";

// Helper function to calculate total word count from treeData
export function calculateTreeWordCount(treeData: ExtendedNodeModel[]): number {
  return treeData
    .filter((node) => node?.data?.fileType === "file") // Only consider files
    .reduce((total, node) => total + (node?.data?.wordCount || 0), 0); // Sum word counts
}

export const convertToCurlyQuotes = (text: string) => {
  // Replace straight double quotes with curly quotes
  let result = text.replace(/(^|[\s(\[{<])"(?=\S)/g, "$1“"); // Opening double quote
  result = result.replace(/(\S)"([\s)\]}>.,!?:;]|$)/g, "$1”$2"); // Closing double quote

  // Replace straight single quotes with curly quotes
  result = result.replace(/(^|[\s(\[{<])'(?=\S)/g, "$1‘"); // Opening single quote
  result = result.replace(/(\S)'([\s)\]}>.,!?:;]|$)/g, "$1’$2"); // Closing single quote

  // Replace apostrophes (contractions and possessives)
  result = result.replace(/(\w)'(\w)/g, "$1’$2");

  // Replace double dashes with em-dash
  result = result.replace(/--/g, "—");

  return result;
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
