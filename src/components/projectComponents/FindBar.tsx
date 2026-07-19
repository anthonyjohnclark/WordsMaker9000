import React from "react";
import { FiChevronUp, FiChevronDown, FiX } from "react-icons/fi";

interface FindBarProps {
  term: string;
  onTermChange: (value: string) => void;
  matchCount: number;
  currentIndex: number; // 0-based index of the active match
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const FindBar: React.FC<FindBarProps> = ({
  term,
  onTermChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onClose,
  inputRef,
}) => {
  const counter =
    matchCount === 0 ? "0/0" : `${currentIndex + 1}/${matchCount}`;

  return (
    <div
      className="flex items-center gap-1 rounded shadow-lg px-2 py-1"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
      }}
      // Prevent the editor's Ctrl+wheel zoom / clicks from leaking through.
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={term}
        placeholder="Find in file..."
        onChange={(e) => onTermChange(e.target.value)}
        className="px-2 py-0.5 text-sm rounded outline-none w-44"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
        }}
      />
      <span
        className="text-xs tabular-nums w-12 text-center select-none"
        style={{ color: "var(--text-muted)" }}
      >
        {counter}
      </span>
      <button
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
        className="p-1 rounded disabled:opacity-40"
        style={{ color: "var(--text-secondary)" }}
      >
        <FiChevronUp size={14} />
      </button>
      <button
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        className="p-1 rounded disabled:opacity-40"
        style={{ color: "var(--text-secondary)" }}
      >
        <FiChevronDown size={14} />
      </button>
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="p-1 rounded"
        style={{ color: "var(--text-secondary)" }}
      >
        <FiX size={14} />
      </button>
    </div>
  );
};

export default FindBar;
