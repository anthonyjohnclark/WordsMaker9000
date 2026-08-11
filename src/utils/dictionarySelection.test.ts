import { hasWholeWordBoundaries } from "./dictionarySelection";

type QuillUnit = string | Record<string, unknown>;

const textReader = (units: QuillUnit[]) => ({
  getText: (index: number, length: number) =>
    units
      .slice(index, index + length)
      .filter((unit): unit is string => typeof unit === "string")
      .join(""),
});

const characters = (value: string): QuillUnit[] => value.split("");

describe("dictionary whole-word selection", () => {
  test.each([
    ["paragraph break", "\n"],
    ["soft break", { softbreak: true }],
    ["scene break", { sceneBreak: "asterisks" }],
  ])("accepts a whole word after a %s", (_label, separator) => {
    const units = [
      ...characters("Before"),
      separator,
      ...characters("After"),
      "\n",
    ];

    expect(
      hasWholeWordBoundaries(textReader(units), { index: 7, length: 5 }),
    ).toBe(true);
  });

  test("rejects a partial word after an embed", () => {
    const units = [
      ...characters("Before"),
      { sceneBreak: "asterisks" },
      ...characters("After"),
      "\n",
    ];

    expect(
      hasWholeWordBoundaries(textReader(units), { index: 8, length: 3 }),
    ).toBe(false);
  });

  test("treats apostrophes and hyphens as part of a word", () => {
    const units = characters("well-being can't\n");

    expect(
      hasWholeWordBoundaries(textReader(units), { index: 5, length: 5 }),
    ).toBe(false);
    expect(
      hasWholeWordBoundaries(textReader(units), { index: 15, length: 1 }),
    ).toBe(false);
  });
});
