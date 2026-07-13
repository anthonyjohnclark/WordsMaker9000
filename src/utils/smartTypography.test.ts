import { smartQuoteChar, convertToCurlyQuotes } from "./smartTypography";

describe("smartQuoteChar", () => {
  it("returns opening double quote at the start of text", () => {
    expect(smartQuoteChar(null, '"')).toBe("“");
  });

  it("returns opening double quote after whitespace", () => {
    expect(smartQuoteChar(" ", '"')).toBe("“");
    expect(smartQuoteChar("\n", '"')).toBe("“");
  });

  it("returns opening double quote after an opening bracket", () => {
    expect(smartQuoteChar("(", '"')).toBe("“");
    expect(smartQuoteChar("[", '"')).toBe("“");
    expect(smartQuoteChar("{", '"')).toBe("“");
    expect(smartQuoteChar("<", '"')).toBe("“");
  });

  it("returns closing double quote after a letter or punctuation", () => {
    expect(smartQuoteChar("a", '"')).toBe("”");
    expect(smartQuoteChar(".", '"')).toBe("”");
    expect(smartQuoteChar(",", '"')).toBe("”");
  });

  it("returns opening single quote at the start of text", () => {
    expect(smartQuoteChar(null, "'")).toBe("‘");
  });

  it("returns opening single quote after whitespace", () => {
    expect(smartQuoteChar(" ", "'")).toBe("‘");
  });

  it("returns opening single quote after an opening bracket", () => {
    expect(smartQuoteChar("(", "'")).toBe("‘");
  });

  it("returns closing single quote after a letter (apostrophe / contraction)", () => {
    expect(smartQuoteChar("n", "'")).toBe("’");
    expect(smartQuoteChar("t", "'")).toBe("’");
  });

  it("returns closing single quote after punctuation", () => {
    expect(smartQuoteChar(".", "'")).toBe("’");
  });
});

describe("convertToCurlyQuotes (paste path)", () => {
  it("converts straight double quotes to curly quotes", () => {
    expect(convertToCurlyQuotes('"hello"')).toBe("“hello”");
  });

  it("converts straight single quotes to curly quotes", () => {
    expect(convertToCurlyQuotes("'hello'")).toBe("‘hello’");
  });

  it("converts apostrophes in contractions", () => {
    expect(convertToCurlyQuotes("don't")).toBe("don’t");
    expect(convertToCurlyQuotes("you're")).toBe("you’re");
  });

  it("converts double dashes to em-dashes", () => {
    expect(convertToCurlyQuotes("word--word")).toBe("word—word");
  });

  it("converts mixed paste content", () => {
    expect(convertToCurlyQuotes('"don\'t" word--word')).toBe("“don’t” word—word");
  });
});
