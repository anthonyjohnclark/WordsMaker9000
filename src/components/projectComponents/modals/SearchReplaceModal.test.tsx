/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useGlobalProjectContext } from "../../../contexts/global/GlobalProjectContext";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { readFile, saveFile } from "../../../utils/fileManager";
import SearchReplaceModal from "./SearchReplaceModal";

jest.mock("../../../contexts/global/GlobalProjectContext", () => ({
  useGlobalProjectContext: jest.fn(),
}));
jest.mock("../../../contexts/pages/ProjectProvider", () => ({
  useProjectContext: jest.fn(),
}));
jest.mock("../../../utils/fileManager", () => ({
  readFile: jest.fn(),
  saveFile: jest.fn(),
}));

const activeContent = "<p>cat cat</p>";
const otherContent = "<p>cat in another file</p>";

function renderSearchReplace() {
  jest.clearAllMocks();

  const files = new Map([
    ["first", activeContent],
    ["second", otherContent],
  ]);
  const editorContentRef = { current: activeContent };
  const setFileContentDirectly = jest.fn((content: string) => {
    editorContentRef.current = content;
  });
  const treeData = [
    {
      id: 1,
      parent: 0,
      text: "Chapter one",
      data: { fileType: "file", fileId: "first", fileName: "Chapter one" },
    },
    {
      id: 2,
      parent: 0,
      text: "Chapter two",
      data: { fileType: "file", fileId: "second", fileName: "Chapter two" },
    },
  ];

  (readFile as jest.Mock).mockImplementation(
    async (_projectName: string, fileId: string) => {
      const content = files.get(fileId);
      if (content === undefined) throw new Error(`Missing fixture: ${fileId}`);
      return content;
    },
  );
  (saveFile as jest.Mock).mockImplementation(
    async (_projectName: string, fileId: string, content: string) => {
      files.set(fileId, content);
    },
  );
  (useGlobalProjectContext as jest.Mock).mockReturnValue({
    isSearchOpen: true,
    setIsSearchOpen: jest.fn(),
  });
  (useProjectContext as jest.Mock).mockReturnValue({
    treeData,
    setTreeData: jest.fn(),
    selectedFile: treeData[0],
    projectName: "Test Project",
    editorContentRef,
    setFileContentDirectly,
  });

  render(<SearchReplaceModal />);
  return { files, editorContentRef, setFileContentDirectly };
}

async function searchForCat() {
  fireEvent.change(screen.getByPlaceholderText("Search..."), {
    target: { value: "cat" },
  });
  await screen.findByText("3 matches across 2 files");
}

function replacementButtons() {
  return [
    ...screen.getAllByTitle("Replace this occurrence"),
    ...screen.getAllByRole("button", { name: "Replace All in File" }),
    screen.getByRole("button", { name: "Replace All in Project" }),
  ] as HTMLButtonElement[];
}

describe("SearchReplaceModal replacement availability", () => {
  it("Empty replacement cannot run (REQ-001)", async () => {
    const { files, editorContentRef, setFileContentDirectly } =
      renderSearchReplace();
    await searchForCat();

    const buttons = replacementButtons();
    expect(buttons).toHaveLength(6);
    expect(buttons.every((button) => button.disabled)).toBe(true);

    await act(async () => {
      buttons.forEach((button) => fireEvent.click(button));
    });

    expect(files.get("first")).toBe(activeContent);
    expect(files.get("second")).toBe(otherContent);
    expect(editorContentRef.current).toBe(activeContent);
    expect(saveFile).not.toHaveBeenCalled();
    expect(setFileContentDirectly).not.toHaveBeenCalled();
  });

  it("Clearing replacement text prevents replacement (REQ-001, REQ-002)", async () => {
    const { files } = renderSearchReplace();
    await searchForCat();

    const replacementInput = screen.getByPlaceholderText("Replace with...");
    fireEvent.change(replacementInput, { target: { value: "dog" } });
    expect(replacementButtons().every((button) => !button.disabled)).toBe(true);

    fireEvent.change(replacementInput, { target: { value: "" } });
    expect(replacementButtons().every((button) => button.disabled)).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "another" },
    });
    await screen.findByText("1 match across 1 file");
    expect(files.get("first")).toBe(activeContent);
    expect(files.get("second")).toBe(otherContent);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it.each(["single", "file", "project"] as const)(
    "Nonempty replacement remains available: %s action (REQ-002)",
    async (action) => {
      const { files, editorContentRef } = renderSearchReplace();
      await searchForCat();
      fireEvent.change(screen.getByPlaceholderText("Replace with..."), {
        target: { value: "dog" },
      });

      const buttons = replacementButtons();
      expect(buttons.every((button) => !button.disabled)).toBe(true);

      if (action === "single") {
        fireEvent.click(screen.getAllByTitle("Replace this occurrence")[0]);
      } else if (action === "file") {
        fireEvent.click(
          screen.getAllByRole("button", { name: "Replace All in File" })[0],
        );
      } else {
        fireEvent.click(
          screen.getByRole("button", { name: "Replace All in Project" }),
        );
      }

      const expectedFirst =
        action === "single" ? "<p>dog cat</p>" : "<p>dog dog</p>";
      const expectedSecond =
        action === "project" ? "<p>dog in another file</p>" : otherContent;
      await waitFor(() => {
        expect(files.get("first")).toBe(expectedFirst);
        expect(files.get("second")).toBe(expectedSecond);
        expect(editorContentRef.current).toBe(expectedFirst);
      });
    },
  );
});
