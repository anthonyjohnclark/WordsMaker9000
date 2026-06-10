// Search & Replace utility functions for Quill HTML content

export interface SearchMatch {
  startIndex: number; // index in the plain-text representation
  contextBefore: string;
  matchedText: string;
  contextAfter: string;
}

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  nodeId: number;
  matches: SearchMatch[];
}

// ── Text-node mapping ──────────────────────────────────────────────────────

interface TextSegment {
  text: string;
  /** Character offset in the full plain-text string where this segment starts */
  plainStart: number;
  /** Start index of the text content inside the original HTML string */
  htmlStart: number;
  /** Length of the text content inside the original HTML string */
  htmlLength: number;
}

/**
 * Walk the HTML string and extract every text-node together with its position
 * in both the plain-text and the original HTML string.
 */
function extractTextSegments(html: string): {
  plainText: string;
  segments: TextSegment[];
} {
  const segments: TextSegment[] = [];
  let plainText = "";
  let i = 0;

  while (i < html.length) {
    if (html[i] === "<") {
      // skip the whole tag
      const closeIdx = html.indexOf(">", i);
      if (closeIdx === -1) break;
      i = closeIdx + 1;
    } else if (html[i] === "&") {
      // decode HTML entity
      const semiIdx = html.indexOf(";", i);
      if (semiIdx === -1) {
        // treat as literal
        segments.push({
          text: html[i],
          plainStart: plainText.length,
          htmlStart: i,
          htmlLength: 1,
        });
        plainText += html[i];
        i++;
      } else {
        const entity = html.substring(i, semiIdx + 1);
        const decoded = decodeEntity(entity);
        segments.push({
          text: decoded,
          plainStart: plainText.length,
          htmlStart: i,
          htmlLength: semiIdx + 1 - i,
        });
        plainText += decoded;
        i = semiIdx + 1;
      }
    } else {
      // regular text run — grab as much as possible
      let end = i + 1;
      while (end < html.length && html[end] !== "<" && html[end] !== "&") {
        end++;
      }
      const text = html.substring(i, end);
      segments.push({
        text,
        plainStart: plainText.length,
        htmlStart: i,
        htmlLength: end - i,
      });
      plainText += text;
      i = end;
    }
  }

  return { plainText, segments };
}

function decodeEntity(entity: string): string {
  const map: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  if (map[entity]) return map[entity];
  // numeric
  if (entity.startsWith("&#x")) {
    return String.fromCharCode(parseInt(entity.slice(3, -1), 16));
  }
  if (entity.startsWith("&#")) {
    return String.fromCharCode(parseInt(entity.slice(2, -1), 10));
  }
  return entity; // unknown entity — return as-is
}

// ── Public API ──────────────────────────────────────────────────────────────

const CONTEXT_CHARS = 40;

/**
 * Find all case-insensitive matches of `term` in the visible text of `html`.
 */
export function findMatchesInHtml(
  html: string,
  term: string
): SearchMatch[] {
  if (!term) return [];

  const { plainText } = extractTextSegments(html);
  const lowerText = plainText.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const matches: SearchMatch[] = [];
  let pos = 0;

  while (pos <= lowerText.length - lowerTerm.length) {
    const idx = lowerText.indexOf(lowerTerm, pos);
    if (idx === -1) break;

    const before = plainText.substring(
      Math.max(0, idx - CONTEXT_CHARS),
      idx
    );
    const after = plainText.substring(
      idx + term.length,
      idx + term.length + CONTEXT_CHARS
    );

    matches.push({
      startIndex: idx,
      contextBefore: (idx - CONTEXT_CHARS > 0 ? "..." : "") + before,
      matchedText: plainText.substring(idx, idx + term.length),
      contextAfter: after + (idx + term.length + CONTEXT_CHARS < plainText.length ? "..." : ""),
    });

    pos = idx + 1; // advance past this match to find overlapping / next
  }

  return matches;
}

/**
 * Replace occurrences of `term` in `html` while preserving HTML tags.
 *
 * If `targetPlainIndices` is supplied only matches whose plain-text start
 * index is in that set will be replaced; otherwise ALL occurrences are
 * replaced.
 */
export function replaceInHtml(
  html: string,
  term: string,
  replacement: string,
  targetPlainIndices?: number[]
): string {
  if (!term) return html;

  const { plainText, segments } = extractTextSegments(html);
  const lowerText = plainText.toLowerCase();
  const lowerTerm = term.toLowerCase();

  // Collect plain-text match ranges
  const matchRanges: { start: number; end: number }[] = [];
  let pos = 0;
  while (pos <= lowerText.length - lowerTerm.length) {
    const idx = lowerText.indexOf(lowerTerm, pos);
    if (idx === -1) break;
    if (!targetPlainIndices || targetPlainIndices.includes(idx)) {
      matchRanges.push({ start: idx, end: idx + term.length });
    }
    pos = idx + 1;
  }

  if (matchRanges.length === 0) return html;

  // Build a list of HTML-level replacements.
  // For each match range in the plain text, figure out which segments it spans
  // and compute the corresponding HTML-level edits.
  interface HtmlEdit {
    htmlStart: number;
    htmlEnd: number;
    replacement: string;
  }

  const edits: HtmlEdit[] = [];

  for (const range of matchRanges) {
    let remaining = range.end - range.start;
    let plainCursor = range.start;
    let isFirst = true;

    for (const seg of segments) {
      const segEnd = seg.plainStart + seg.text.length;
      if (segEnd <= plainCursor) continue; // segment before our range
      if (seg.plainStart >= range.end) break; // past our range

      const overlapStart = Math.max(seg.plainStart, plainCursor);
      const overlapEnd = Math.min(segEnd, range.end);
      const localStart = overlapStart - seg.plainStart;
      const localEnd = overlapEnd - seg.plainStart;

      // Map local offsets to HTML offsets inside this segment.
      // For simple text segments htmlStart/htmlLength is 1:1 with text.
      // For entity segments the html representation differs in length.
      const ratio = seg.htmlLength / seg.text.length;
      const htmlOffsetStart = seg.htmlStart + Math.round(localStart * ratio);
      const htmlOffsetEnd = seg.htmlStart + Math.round(localEnd * ratio);

      if (isFirst) {
        edits.push({
          htmlStart: htmlOffsetStart,
          htmlEnd: htmlOffsetEnd,
          replacement: replacement,
        });
        isFirst = false;
      } else {
        // Continuation of the same match across multiple segments — just delete
        edits.push({
          htmlStart: htmlOffsetStart,
          htmlEnd: htmlOffsetEnd,
          replacement: "",
        });
      }

      remaining -= overlapEnd - overlapStart;
      plainCursor = overlapEnd;
      if (remaining <= 0) break;
    }
  }

  // Apply edits in reverse order so indices stay valid
  let result = html;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    result = result.substring(0, e.htmlStart) + e.replacement + result.substring(e.htmlEnd);
  }

  return result;
}

/**
 * Count words in an HTML string (visible text only).
 */
export function countWordsInHtml(html: string): number {
  const { plainText } = extractTextSegments(html);
  const trimmed = plainText.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
