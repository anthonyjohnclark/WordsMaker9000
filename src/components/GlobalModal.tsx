import { createPortal } from "react-dom";
import { useModal } from "../contexts/global/ModalContext";

const GlobalModal = (): JSX.Element | null => {
  const modal = useModal();
  const modalContent = modal.modalContent;
  const container =
    modal.modalContainer ||
    (typeof document !== "undefined" ? document.body : null);

  if (!modal.show || !container) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onClick={modal.handleClose}
    >
      <div
        className={`p-6 rounded shadow-lg ${
          modalContent.modalSize === "wide"
            ? "w-[calc(100vw-3rem)] max-w-6xl"
            : "w-96"
        }`}
        style={{
          background: "var(--modal-bg)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click from closing
      >
        {modalContent.modalBody}
      </div>
    </div>,
    container,
  );
};

export default GlobalModal;
