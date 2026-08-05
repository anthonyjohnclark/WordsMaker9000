import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalProjectContext } from "../../../contexts/global/GlobalProjectContext";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { readFile, saveFile } from "../../../utils/fileManager";
import {
  findMatchesInHtml,
  replaceInHtml,
  countWordsInHtml,
  FileSearchResult,
} from "../../../utils/searchUtils";
import { FiX, FiRefreshCw } from "react-icons/fi";
import { ExtendedNodeModel } from "../../../types/ProjectPageTypes";

const SearchReplaceModal = () => {
  const { isSearchOpen, setIsSearchOpen } = useGlobalProjectContext();
  const {
    treeData,
    setTreeData,
    selectedFile,
    projectName,
    editorContentRef,
    setFileContentDirectly,
  } = useProjectContext();

  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus search input on open
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      // Reset state when modal closes
      setSearchTerm("");
      setReplaceTerm("");
      setResults([]);
      setTotalMatches(0);
    }
  }, [isSearchOpen]);

  // Keyboard shortcut: Ctrl+Shift+F to toggle, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isSearchOpen) {
        e.preventDefault();
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSearchOpen, setIsSearchOpen]);

  const fileNodes = treeData.filter((n) => n.data?.fileType === "file");

  // ── Search logic ──────────────────────────────────────────────────────────

  const runSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        setTotalMatches(0);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      try {
        const fileResults: FileSearchResult[] = [];

        for (const node of fileNodes) {
          const fileId = node.data?.fileId;
          if (!fileId) continue;

          let content: string;
          if (selectedFile && node.id === selectedFile.id) {
            content = editorContentRef.current;
          } else {
            try {
              content = await readFile(decodeURIComponent(projectName), fileId);
            } catch {
              continue; // skip unreadable files
            }
          }

          const matches = findMatchesInHtml(content, term);
          if (matches.length > 0) {
            fileResults.push({
              fileId,
              fileName: node.data?.fileName ?? node.text,
              nodeId: node.id as number,
              matches,
            });
          }
        }

        setResults(fileResults);
        setTotalMatches(
          fileResults.reduce((sum, r) => sum + r.matches.length, 0),
        );
      } finally {
        setIsSearching(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileNodes.length, projectName, selectedFile?.id],
  );

  // Debounced search on term change
  useEffect(() => {
    if (!isSearchOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(searchTerm), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, isSearchOpen, runSearch]);

  // ── Replace helpers ───────────────────────────────────────────────────────

  const updateWordCountForFile = useCallback(
    (fileId: string, newContent: string) => {
      const wc = countWordsInHtml(newContent);
      setTreeData((prev) => {
        const updated = prev.map((n) =>
          n.data?.fileId === fileId
            ? ({
                ...n,
                data: { ...n.data, wordCount: wc, lastModified: new Date() },
              } as ExtendedNodeModel)
            : n,
        );
        return updated;
      });
    },
    [setTreeData],
  );

  const replaceAndSave = useCallback(
    async (fileId: string, nodeId: number, targetIndices?: number[]) => {
      const isActive = selectedFile && (selectedFile.id as number) === nodeId;
      let content: string;

      if (isActive) {
        content = editorContentRef.current;
      } else {
        content = await readFile(decodeURIComponent(projectName), fileId);
      }

      const newContent = replaceInHtml(
        content,
        searchTerm,
        replaceTerm,
        targetIndices,
      );

      await saveFile(decodeURIComponent(projectName), fileId, newContent);

      if (isActive) {
        setFileContentDirectly(newContent);
      }

      updateWordCountForFile(fileId, newContent);
    },
    [
      selectedFile,
      editorContentRef,
      projectName,
      searchTerm,
      replaceTerm,
      setFileContentDirectly,
      updateWordCountForFile,
    ],
  );

  const handleReplaceSingle = async (
    fileId: string,
    nodeId: number,
    startIndex: number,
  ) => {
    await replaceAndSave(fileId, nodeId, [startIndex]);
    runSearch(searchTerm);
  };

  const handleReplaceAllInFile = async (fileId: string, nodeId: number) => {
    await replaceAndSave(fileId, nodeId);
    runSearch(searchTerm);
  };

  const handleReplaceAllInProject = async () => {
    for (const r of results) {
      await replaceAndSave(r.fileId, r.nodeId);
    }
    runSearch(searchTerm);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isSearchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsSearchOpen(false);
      }}
    >
      <div
        className="rounded-lg shadow-xl flex flex-col"
        style={{
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          width: "min(640px, 90vw)",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="font-semibold text-base">Search &amp; Replace</span>
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--accent)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Inputs */}
        <div
          className="px-4 py-3 space-y-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 rounded text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="w-full px-3 py-1.5 rounded text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        {/* Results */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{ minHeight: 0 }}
        >
          {isSearching && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Searching...
            </p>
          )}

          {!isSearching && searchTerm && results.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No results found.
            </p>
          )}

          {!isSearching && fileNodes.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No files to search.
            </p>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {totalMatches} match{totalMatches !== 1 ? "es" : ""} across{" "}
                {results.length} file{results.length !== 1 ? "s" : ""}
              </p>

              {results.map((fileResult) => (
                <div key={fileResult.fileId} className="space-y-1">
                  {/* File header */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: "var(--accent)" }}
                    >
                      📄 {fileResult.fileName}{" "}
                      <span style={{ color: "var(--text-muted)" }}>
                        ({fileResult.matches.length} match
                        {fileResult.matches.length !== 1 ? "es" : ""})
                      </span>
                    </span>
                    {replaceTerm !== undefined && (
                      <button
                        onClick={() =>
                          handleReplaceAllInFile(
                            fileResult.fileId,
                            fileResult.nodeId,
                          )
                        }
                        className="text-xs px-2 py-0.5 rounded shrink-0 ml-2 transition-colors"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--accent)";
                          e.currentTarget.style.color = "var(--bg-primary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "var(--bg-secondary)";
                          e.currentTarget.style.color = "var(--text-secondary)";
                        }}
                      >
                        Replace All in File
                      </button>
                    )}
                  </div>

                  {/* Individual matches */}
                  {fileResult.matches.map((match, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs"
                      style={{ background: "var(--bg-secondary)" }}
                    >
                      <span
                        className="truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {match.contextBefore}
                        <strong style={{ color: "var(--accent)" }}>
                          {match.matchedText}
                        </strong>
                        {match.contextAfter}
                      </span>
                      <button
                        onClick={() =>
                          handleReplaceSingle(
                            fileResult.fileId,
                            fileResult.nodeId,
                            match.startIndex,
                          )
                        }
                        className="ml-2 p-1 rounded shrink-0 transition-colors"
                        style={{ color: "var(--text-secondary)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--accent)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "var(--text-secondary)")
                        }
                        title="Replace this occurrence"
                      >
                        <FiRefreshCw size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 pt-4 pb-3 flex justify-end">
            <button
              onClick={handleReplaceAllInProject}
              className="text-xs px-3 py-1.5 rounded font-semibold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--bg-primary)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Replace All in Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchReplaceModal;
