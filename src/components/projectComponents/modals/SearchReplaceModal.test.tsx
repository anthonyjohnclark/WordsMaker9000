/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useGlobalProjectContext } from "../../../contexts/global/GlobalProjectContext";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { ExtendedNodeModel } from "../../../types/ProjectPageTypes";
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

const makeFile = (id: number, fileId: string): ExtendedNodeModel => ({
  id,
  parent: 0,
  text: `Chapter ${id}`,
  data: {
    fileType: "file",
    fileName: `Chapter ${id}`,
    fileId,
    wordCount: 1,
    lastModified: new Date(0),
    createDate: new Date(0),
  },
});

const setup = (contents: string[]) => {
  const treeData = contents.map((_, index) =>
    makeFile(index + 1, `file-${index + 1}`),
  );
  const storedContent = new Map<string, string>(
    contents.map((content, index): [string, string] => [
      `file-${index + 1}`,
      content,
    ]),
  );
  const editorContentRef = { current: contents[0] };
  const setFileContentDirectly = jest.fn((content: string) => {
    editorContentRef.current = content;
  });

  jest.mocked(readFile).mockImplementation(async (_projectName, fileId) => {
    if (!fileId) throw new Error("Missing file ID");
    const content = storedContent.get(fileId);
    if (content === undefined) throw new Error(`Missing ${fileId}`);
    return content;
  });
  jest.mocked(saveFile).mockImplementation(async (_projectName, fileId, content) => {
    if (!fileId) throw new Error("Missing file ID");
    storedContent.set(fileId, content);
  });
  // These partial context mocks provide only the fields consumed by the modal.
  jest.mocked(useGlobalProjectContext).mockReturnValue({
    isSearchOpen: true,
    setIsSearchOpen: jest.fn(),
  } as unknown as ReturnType<typeof useGlobalProjectContext>);
  jest.mocked(useProjectContext).mockReturnValue({
    treeData,
    setTreeData: jest.fn(),
    selectedFile: treeData[0],
    projectName: "Test Project",
    editorContentRef,
    setFileContentDirectly,
  } as unknown as ReturnType<typeof useProjectContext>);

  render(<SearchReplaceModal />);

  return { storedContent, editorContentRef, setFileContentDirectly };
};

const searchFor = async (term: string, expectedMatches: number) => {
  fireEvent.change(screen.getByPlaceholderText("Search..."), {
    target: { value: term },
  });
  await waitFor(() => {
    expect(screen.getAllByText(term, { selector: "strong" })).toHaveLength(
      expectedMatches,
    );
  });
};

const replacementButtons = () => [
  ...screen.getAllByTitle("Replace this occurrence"),
  ...screen.getAllByRole("button", { name: "Replace All in File" }),
  screen.getByRole("button", { name: "Replace All in Project" }),
];

describe("Search & Replace replacement availability", () => {
  beforeEach(() => jest.clearAllMocks());

  test("empty replacement cannot run and leaves project content unchanged (REQ-001)", async () => {
    const { storedContent, editorContentRef, setFileContentDirectly } = setup([
      "<p>red red</p>",
      "<p>red</p>",
    ]);
    await searchFor("red", 3);

    for (const button of replacementButtons()) {
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
    }

    expect(saveFile).not.toHaveBeenCalled();
    expect(setFileContentDirectly).not.toHaveBeenCalled();
    expect(editorContentRef.current).toBe("<p>red red</p>");
    expect(storedContent.get("file-1")).toBe("<p>red red</p>");
    expect(storedContent.get("file-2")).toBe("<p>red</p>");
  });

  test("clearing replacement text disables actions while search remains available (REQ-001, REQ-002)", async () => {
    setup(["<p>red blue</p>"]);
    await searchFor("red", 1);

    const replacementInput = screen.getByPlaceholderText("Replace with...");
    fireEvent.change(replacementInput, { target: { value: "green" } });
    for (const button of replacementButtons()) {
      expect(button.hasAttribute("disabled")).toBe(false);
    }

    fireEvent.change(replacementInput, { target: { value: "" } });
    for (const button of replacementButtons()) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByText("red", { selector: "strong" })).toBeTruthy();

    await searchFor("blue", 1);
    expect(screen.getByText("blue", { selector: "strong" })).toBeTruthy();
    expect(saveFile).not.toHaveBeenCalled();
  });

  test("nonempty replacement changes only the chosen occurrence (REQ-002)", async () => {
    const { editorContentRef } = setup(["<p>red red</p>"]);
    await searchFor("red", 2);
    fireEvent.change(screen.getByPlaceholderText("Replace with..."), {
      target: { value: "blue" },
    });

    const firstMatch = screen.getAllByTitle("Replace this occurrence")[0];
    expect(firstMatch.hasAttribute("disabled")).toBe(false);
    fireEvent.click(firstMatch);

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(
        "Test Project",
        "file-1",
        "<p>blue red</p>",
      );
      expect(editorContentRef.current).toBe("<p>blue red</p>");
    });
  });

  test("nonempty replacement changes all matches in one file (REQ-002)", async () => {
    const { editorContentRef } = setup(["<p>red red</p>"]);
    await searchFor("red", 2);
    fireEvent.change(screen.getByPlaceholderText("Replace with..."), {
      target: { value: "blue" },
    });

    const replaceFile = screen.getByRole("button", {
      name: "Replace All in File",
    });
    expect(replaceFile.hasAttribute("disabled")).toBe(false);
    fireEvent.click(replaceFile);

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(
        "Test Project",
        "file-1",
        "<p>blue blue</p>",
      );
      expect(editorContentRef.current).toBe("<p>blue blue</p>");
    });
  });

  test("nonempty replacement changes matches across the project (REQ-002)", async () => {
    const { storedContent, editorContentRef } = setup([
      "<p>red</p>",
      "<p>red</p>",
    ]);
    await searchFor("red", 2);
    fireEvent.change(screen.getByPlaceholderText("Replace with..."), {
      target: { value: "blue" },
    });

    const replaceProject = screen.getByRole("button", {
      name: "Replace All in Project",
    });
    expect(replaceProject.hasAttribute("disabled")).toBe(false);
    fireEvent.click(replaceProject);

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(
        "Test Project",
        "file-1",
        "<p>blue</p>",
      );
      expect(saveFile).toHaveBeenCalledWith(
        "Test Project",
        "file-2",
        "<p>blue</p>",
      );
      expect(editorContentRef.current).toBe("<p>blue</p>");
      expect(storedContent.get("file-2")).toBe("<p>blue</p>");
    });
  });
});
