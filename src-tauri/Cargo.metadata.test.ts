import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Cargo package metadata", () => {
  const cargoToml = readFileSync(
    join(process.cwd(), "src-tauri/Cargo.toml"),
    "utf8",
  );

  test('declares "Carborundum" as the package author', () => {
    expect(cargoToml).toContain('authors = ["Carborundum"]');
  });
});
