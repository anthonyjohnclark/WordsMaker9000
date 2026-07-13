import { convertToCurlyQuotes } from "./helpers";

export function smartQuoteChar(
  prevChar: string | null,
  typed: '"' | "'",
): string {
  // Opening quote if at the start of text, after whitespace, or after an opening bracket.
  if (prevChar == null || /[\s(\[{<]/.test(prevChar)) {
    return typed === '"' ? "“" : "‘";
  }
  return typed === '"' ? "”" : "’";
}

export { convertToCurlyQuotes };
