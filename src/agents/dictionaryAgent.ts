import { invoke } from "@tauri-apps/api/core";
import { DictionaryEntry } from "../types/DictionaryTypes";

export class DictionaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryError";
  }
}

// Simple in-memory cache to avoid re-hitting the free API for repeat lookups.
const cache = new Map<string, DictionaryEntry[]>();

type NativeDictionaryError = {
  code?: unknown;
  message?: unknown;
};

const nativeErrorMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;

  const nativeError = error as NativeDictionaryError;
  return typeof nativeError.code === "string" &&
    nativeError.code.startsWith("DICTIONARY_") &&
    typeof nativeError.message === "string" &&
    nativeError.message.trim()
    ? nativeError.message
    : null;
};

export const normalizeWord = (raw: string): string => {
  // Trim, then strip leading/trailing characters that aren't letters
  // (quotes, punctuation), while preserving internal hyphens/apostrophes.
  return raw
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .toLowerCase();
};

export const defineWord = async (word: string): Promise<DictionaryEntry[]> => {
  const key = normalizeWord(word);

  if (!key) {
    throw new DictionaryError("No word selected.");
  }

  if (cache.has(key)) {
    return cache.get(key)!;
  }

  try {
    const data = await invoke<unknown>("lookup_dictionary_definition", {
      word: key,
    });

    if (!Array.isArray(data) || data.length === 0) {
      throw new DictionaryError(
        "Dictionary service returned an unexpected response. Try again later."
      );
    }

    const entries = data as DictionaryEntry[];
    cache.set(key, entries);
    return entries;
  } catch (error) {
    console.error("Error fetching definition:", error);

    if (error instanceof DictionaryError) throw error;

    const message = nativeErrorMessage(error);
    throw new DictionaryError(
      message ??
        "Dictionary lookup could not start. Restart WordsMaker9000 and try again."
    );
  }
};
