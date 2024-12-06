import React from "react";
import { useModal } from "../contexts/global/ModalContext";

const GlobalModal = (): JSX.Element => {
  const modal = useModal();
  const modalContent = useModal().modalContent;

  return (
    <>
      {modal.show && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          onClick={modal.handleClose}
        >
          <div
            className="bg-gray-800 p-6 rounded shadow-lg w-96"
            onClick={(e) => e.stopPropagation()} // Prevent backdrop click from closing
          >
            {modalContent.modalBody}
          </div>
        </div>
      )}
    </>
  );
};

export default GlobalModal;
