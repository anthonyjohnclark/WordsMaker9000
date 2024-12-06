import { useModal } from "gilgamesh/app/contexts/global/ModalContext";
import { useProjectContext } from "gilgamesh/app/contexts/pages/ProjectProvider";
import { ExtendedNodeModel, NodeData } from "../../types/ProjectPageTypes";
import { NodeModel } from "@minoru/react-dnd-treeview";

interface IProps {
  node: ExtendedNodeModel | NodeModel<NodeData>;
}

export const DeleteConfirmationModal = ({ node }: IProps) => {
  const modal = useModal();
  const project = useProjectContext();

  const handleDeleteConfirm = async () => {
    await project.handleDelete(
      node.id as number,
      node.data?.fileId,
      node.data?.fileType
    );
  };

  return (
    <>
      <h2 className="text-xl font-bold text-white mb-4">Confirm Deletion</h2>
      <p className="text-white mb-4">
        Are you sure you want to delete <strong>{node.text}</strong>?
      </p>
      <div className="flex justify-end gap-4 mt-4">
        <button
          onClick={() => modal.handleClose()}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            handleDeleteConfirm();
            modal.handleClose();
          }}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-400"
        >
          Delete
        </button>
      </div>
    </>
  );
};
