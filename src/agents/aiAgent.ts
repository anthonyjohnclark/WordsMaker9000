import { invoke } from "@tauri-apps/api/core";

export const aiProofreadContent = async (content: string): Promise<string> => {
  try {
    const response = await invoke<{ proofreadContent: string }>(
      "proofread_content",
      { content }
    );
    return response.proofreadContent;
  } catch (error) {
    console.error("Error in proofreadContent function:", error);
    throw new Error("Failed to proofread the content");
  }
};

// Placeholder functions for suggestions and review
export const getSuggestions = async (_content: string): Promise<string> => {
  // Implement similar logic for suggestions
  return "Suggestions function not implemented";
};

export const getReview = async (_content: string): Promise<string> => {
  // Implement similar logic for review
  return "Review function not implemented";
};
