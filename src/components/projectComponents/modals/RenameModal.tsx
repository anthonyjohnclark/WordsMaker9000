import { NodeModel } from "@minoru/react-dnd-treeview";
import { useState } from "react";
import { useErrorContext } from "../../../contexts/global/ErrorContext";
import { useModal } from "../../../contexts/global/ModalContext";
import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { ExtendedNodeModel, NodeData } from "../../../types/ProjectPageTypes";
import Loadable from "../../Loadable";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const RenameModal = ({ node }: IProps) => {
  const modal = useModal();
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { showError } = useErrorContext();

  const project = useProjectContext();

  const handleRenameSubmit = async (
    node: ExtendedNodeModel | NodeModel<NodeData>,
  ) => {
    if (newName.trim()) {
      setIsLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        project.handleRename(node.id as number, newName.trim());

        modal.handleClose();
      } catch (error) {
        showError(error, "renaming the file");
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Loadable isLoading={isLoading}>
      <>
        <h2
          className="text-lg font-bold mb-4 flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          Rename Folder
        </h2>
        <input
          type="text"
          value={newName}
          placeholder={node.text}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full p-3 border rounded text-lg focus:outline-none"
          style={{
            borderColor: "var(--border-color)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
          autoFocus
        />
        <div className="flex justify-end gap-4 mt-4">
          <button
            onClick={() => modal.handleClose()}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleRenameSubmit(node)}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--accent-bg)",
              color: "var(--accent-text)",
            }}
          >
            Save
          </button>
        </div>
      </>
    </Loadable>
  );
};
