import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Home footer contract", () => {
  const homeSource = readFileSync(
    join(process.cwd(), "src/components/Home.tsx"),
    "utf8",
  );

  test("renders the app version in the footer", () => {
    expect(homeSource).toContain("v{__APP_VERSION__}");
  });

  test("uses Carborundum ownership text and keeps the logo symbol", () => {
    expect(homeSource).toContain(
      "© {new Date().getFullYear()} Carborundum",
    );
    expect(homeSource).toContain(
      '<use href="/wordsmaker9000.svg#wordsmaker9000-logo" />',
    );
  });
});
