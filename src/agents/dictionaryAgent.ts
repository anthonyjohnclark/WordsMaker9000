import { DictionaryEntry } from "../types/DictionaryTypes";

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";

export class DictionaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryError";
  }
}

// Simple in-memory cache to avoid re-hitting the free API for repeat lookups.
const cache = new Map<string, DictionaryEntry[]>();

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${encodeURIComponent(key)}`);
  } catch (error) {
    console.error("Error fetching definition:", error);
    throw new DictionaryError(
      "Network error. Check your internet connection and try again."
    );
  }

  if (response.status === 404) {
    throw new DictionaryError(`No definition found for "${key}".`);
  }

  if (!response.ok) {
    throw new DictionaryError(
      `Dictionary service error (${response.status}). Try again later.`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new DictionaryError(`No definition found for "${key}".`);
  }

  cache.set(key, data as DictionaryEntry[]);
  return data as DictionaryEntry[];
};
