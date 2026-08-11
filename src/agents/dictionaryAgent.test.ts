import { invoke } from "@tauri-apps/api/core";
import { defineWord, DictionaryError } from "./dictionaryAgent";
import { DictionaryEntry } from "../types/DictionaryTypes";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
}));

const entry = (word: string): DictionaryEntry => ({
  word,
  phonetics: [],
  meanings: [],
  sourceUrls: [],
});

describe("defineWord", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  test("uses the native command and caches successful definitions", async () => {
    const result = [entry("vinyl-native-cache")];
    (invoke as jest.Mock).mockResolvedValue(result);

    await expect(defineWord("Vinyl-Native-Cache")).resolves.toEqual(result);
    await expect(defineWord("vinyl-native-cache")).resolves.toEqual(result);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("lookup_dictionary_definition", {
      word: "vinyl-native-cache",
    });
  });

  test.each([
    [
      "DICTIONARY_NOT_FOUND",
      'No definition found for "missing-native-word".',
    ],
    [
      "DICTIONARY_RATE_LIMITED",
      "Dictionary service is busy (HTTP 429). Wait a moment and try again.",
    ],
    [
      "DICTIONARY_SERVICE_UNAVAILABLE",
      "Dictionary service is temporarily unavailable (HTTP 502). Try again later.",
    ],
    [
      "DICTIONARY_TIMEOUT",
      "Dictionary request timed out. Try again.",
    ],
  ])("shows the native %s message", async (code, message) => {
    (invoke as jest.Mock).mockRejectedValue({ code, message });

    await expect(defineWord(`error-${code}`)).rejects.toEqual(
      new DictionaryError(message)
    );
  });

  test("reports a malformed successful response", async () => {
    (invoke as jest.Mock).mockResolvedValue({ word: "not-an-array" });

    await expect(defineWord("malformed-native-response")).rejects.toThrow(
      "Dictionary service returned an unexpected response. Try again later."
    );
  });

  test("does not expose an unexpected invoke error", async () => {
    (invoke as jest.Mock).mockRejectedValue(
      "window.__TAURI_INTERNALS__ is undefined"
    );

    await expect(defineWord("invoke-native-error")).rejects.toThrow(
      "Dictionary lookup could not start. Restart WordsMaker9000 and try again."
    );
  });
});
