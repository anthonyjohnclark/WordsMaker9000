import {
  formatWritingQuote,
  getRandomWritingQuote,
  WRITING_QUOTES,
} from "./writingQuotes";

describe("writing quotes", () => {
  test("keeps a large, sourced, duplicate-free collection", () => {
    expect(WRITING_QUOTES.length).toBeGreaterThanOrEqual(200);

    const quoteTexts = new Set<string>();

    for (const quote of WRITING_QUOTES) {
      expect(quote.text).toBe(quote.text.trim());
      expect(quote.author).toBe(quote.author.trim());
      expect(quote.source).toBe(quote.source.trim());
      expect(quote.text.length).toBeGreaterThan(0);
      expect(quote.author.length).toBeGreaterThan(0);
      expect(quote.source.length).toBeGreaterThan(0);
      expect(quoteTexts.has(quote.text)).toBe(false);
      quoteTexts.add(quote.text);
    }
  });

  test("can select the first and last quotations", () => {
    expect(getRandomWritingQuote(() => 0)).toBe(WRITING_QUOTES[0]);
    expect(getRandomWritingQuote(() => 0.999999999)).toBe(
      WRITING_QUOTES[WRITING_QUOTES.length - 1],
    );
  });

  test("formats a quotation for the title bar", () => {
    expect(
      formatWritingQuote({
        text: "Brevity is the soul of wit.",
        author: "William Shakespeare",
        source: "Hamlet",
      }),
    ).toBe("“Brevity is the soul of wit.” — William Shakespeare");
  });
});
