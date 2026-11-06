import { Children, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { useModal } from "../../contexts/global/ModalContext";
import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import type { ExtendedNodeModel } from "../../types/ProjectPageTypes";
import { RenameModal } from "./modals/RenameModal";
import TreeNode from "./TreeNode";

jest.mock("../../contexts/global/ModalContext", () => ({
  useModal: jest.fn(),
}));
jest.mock("../../contexts/pages/ProjectProvider", () => ({
  useProjectContext: jest.fn(),
}));
jest.mock("./modals/AddFileFolderModal", () => ({
  AddFileFolderModal: () => null,
}));
jest.mock("./modals/DeleteConfirmationModal", () => ({
  DeleteConfirmationModal: () => null,
}));
jest.mock("./modals/RenameModal", () => ({
  RenameModal: () => null,
}));

type ClickEvent = {
  stopPropagation: () => void;
  isPropagationStopped: () => boolean;
};
type ElementProps = {
  title?: string;
  children?: ReactNode;
  onClick?: (event: ClickEvent) => void;
};

function findByTitle(
  children: ReactNode,
  title: string,
): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.props.title === title) return child;
    const match = findByTitle(child.props.children, title);
    if (match) return match;
  }
  return undefined;
}

const folder: ExtendedNodeModel = {
  id: 42,
  parent: 0,
  text: "Chapters",
  droppable: true,
  data: {
    fileType: "folder",
    fileName: "Chapters",
    fileId: "chapters",
    wordCount: 0,
    createDate: new Date("2026-01-01T00:00:00Z"),
    lastModified: new Date("2026-01-01T00:00:00Z"),
  },
};

const renderModal = jest.fn();

function folderRow(initiallyOpen: boolean) {
  let expanded = initiallyOpen;
  const onToggle = jest.fn(() => { expanded = !expanded; });
  const row = TreeNode({
    node: folder,
    depth: 0,
    isOpen: initiallyOpen,
    onToggle,
  });
  return { row, onToggle, isExpanded: () => expanded };
}

describe("folder Rename expansion (CARBO-0002)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Only provider boundaries are replaced; TreeNode's callbacks remain real.
    jest.mocked(useModal).mockReturnValue({
      renderModal,
      show: false,
    } as ReturnType<typeof useModal>);
    jest.mocked(useProjectContext).mockReturnValue({
      selectedFile: null,
    } as ReturnType<typeof useProjectContext>);
  });

  test.each([
    ["Rename an expanded folder", true],
    ["Rename a collapsed folder", false],
  ] as const)("%s [REQ-001]", (_scenario, initiallyOpen) => {
    const { row, onToggle, isExpanded } = folderRow(initiallyOpen);
    const rename = findByTitle(row, "Rename");
    if (!rename?.props.onClick) throw new Error("Rename action is missing");
    let stopped = false;
    const event: ClickEvent = {
      stopPropagation: () => { stopped = true; },
      isPropagationStopped: () => stopped,
    };

    // Model bubbling to the actual row callback, without a DOM renderer.
    rename.props.onClick(event);
    if (!event.isPropagationStopped()) row.props.onClick();

    expect(event.isPropagationStopped()).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    expect(isExpanded()).toBe(initiallyOpen);
    expect(renderModal).toHaveBeenCalledTimes(1);
    const { modalBody } = renderModal.mock.calls[0][0];
    expect(isValidElement(modalBody)).toBe(true);
    expect(modalBody.type).toBe(RenameModal);
    expect(modalBody.props.node).toBe(folder);
  });

  test("Toggle a folder through its row [REQ-002]", () => {
    for (const initiallyOpen of [true, false]) {
      const { row, onToggle, isExpanded } = folderRow(initiallyOpen);

      row.props.onClick();

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(isExpanded()).toBe(!initiallyOpen);
      expect(renderModal).not.toHaveBeenCalled();
    }
  });
});
