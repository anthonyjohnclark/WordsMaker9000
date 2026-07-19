import { useEffect, useMemo, useState } from "react";
import { FiVolume2, FiX } from "react-icons/fi";
import { useModal } from "../../contexts/global/ModalContext";
import { defineWord, DictionaryError } from "../../agents/dictionaryAgent";
import { DictionaryEntry } from "../../types/DictionaryTypes";
import Loader from "../Loader";

interface DefinitionModalProps {
  word: string;
}

const dedupe = (values: string[]): string[] =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));

const DefinitionModal = ({ word }: DefinitionModalProps) => {
  const modal = useModal();
  const [entries, setEntries] = useState<DictionaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await defineWord(word);
        if (!cancelled) setEntries(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof DictionaryError
              ? err.message
              : "Something went wrong looking up that word."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [word]);

  const audioUrl = useMemo(() => {
    if (!entries) return undefined;
    for (const entry of entries) {
      const withAudio = entry.phonetics?.find((p) => p.audio);
      if (withAudio?.audio) return withAudio.audio;
    }
    return undefined;
  }, [entries]);

  const phonetic = useMemo(() => {
    if (!entries) return undefined;
    for (const entry of entries) {
      if (entry.phonetic) return entry.phonetic;
      const withText = entry.phonetics?.find((p) => p.text);
      if (withText?.text) return withText.text;
    }
    return undefined;
  }, [entries]);

  const playAudio = () => {
    if (audioUrl) {
      new Audio(audioUrl).play().catch((e) => console.error("Audio error:", e));
    }
  };

  const headerWord = entries?.[0]?.word ?? word;

  return (
    <div style={{ color: "var(--text-primary)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold truncate" title={headerWord}>
              {headerWord}
            </h2>
            {audioUrl && (
              <button
                onClick={playAudio}
                title="Play pronunciation"
                className="flex-shrink-0"
                style={{ color: "var(--accent)" }}
              >
                <FiVolume2 />
              </button>
            )}
          </div>
          {phonetic && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {phonetic}
            </p>
          )}
        </div>
        <button
          onClick={modal.handleClose}
          title="Close"
          className="flex-shrink-0 ml-2 text-xl"
          style={{ color: "var(--text-muted)" }}
        >
          <FiX />
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto pr-1">
        {isLoading && (
          <div className="py-8">
            <Loader />
          </div>
        )}

        {!isLoading && error && (
          <p className="py-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            {error}
          </p>
        )}

        {!isLoading &&
          !error &&
          entries?.map((entry, entryIndex) =>
            entry.meanings.map((meaning, meaningIndex) => {
              const synonyms = dedupe([
                ...meaning.synonyms,
                ...meaning.definitions.flatMap((d) => d.synonyms),
              ]);
              const antonyms = dedupe([
                ...meaning.antonyms,
                ...meaning.definitions.flatMap((d) => d.antonyms),
              ]);

              return (
                <div
                  key={`${entryIndex}-${meaningIndex}`}
                  className="mb-4 last:mb-0"
                >
                  <p
                    className="text-sm italic font-semibold mb-1"
                    style={{ color: "var(--accent)" }}
                  >
                    {meaning.partOfSpeech}
                  </p>
                  <ol
                    className="list-decimal list-inside space-y-1 text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {meaning.definitions.map((def, defIndex) => (
                      <li key={defIndex}>
                        {def.definition}
                        {def.example && (
                          <span
                            className="block ml-5 italic"
                            style={{ color: "var(--text-muted)" }}
                          >
                            &ldquo;{def.example}&rdquo;
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>

                  {synonyms.length > 0 && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span className="font-semibold">Synonyms: </span>
                      {synonyms.join(", ")}
                    </p>
                  )}
                  {antonyms.length > 0 && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span className="font-semibold">Antonyms: </span>
                      {antonyms.join(", ")}
                    </p>
                  )}
                </div>
              );
            })
          )}
      </div>

      {!isLoading && !error && entries?.[0]?.sourceUrls?.[0] && (
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Source:{" "}
          <a
            href={entries[0].sourceUrls[0]}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)" }}
          >
            Wiktionary
          </a>
          {entries[0].license && ` (${entries[0].license.name})`}
        </p>
      )}
    </div>
  );
};

export default DefinitionModal;
