import { invoke } from "@tauri-apps/api/core";

export const aiProofreadContent = async (content: string): Promise<string> => {
  try {
    const response = await invoke<{ result: string }>("proofread_content", {
      content,
    });

    return response.result;
  } catch (error) {
    console.error("Error in proofreadContent function:", error);
    throw new Error("Failed to proofread the content");
  }
};

export const aiGetSuggestions = async (content: string): Promise<string> => {
  try {
    const response = await invoke<{ result: string }>("ai_suggestions", {
      content,
    });

    return response.result;
  } catch (error) {
    console.error("Error in aiGetSuggestions function:", error);
    throw new Error("Failed to fetch suggestions");
  }
};

export const aiGetReview = async (content: string): Promise<string> => {
  try {
    const response = await invoke<{ result: string }>("ai_review", {
      content,
    });
    return response.result;
  } catch (error) {
    console.error("Error in aiGetReview function:", error);
    throw new Error("Failed to fetch review feedback");
  }
};
