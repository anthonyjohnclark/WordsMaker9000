import React from "react";
import { useErrorContext } from "../contexts/global/ErrorContext";

const ErrorModal: React.FC = () => {
  const { error, clearError, errorAction } = useErrorContext();

  if (!error) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onClick={clearError}
    >
      <div
        className="p-6 rounded shadow-lg w-3/5 h-1/3 flex flex-col overflow-hidden"
        style={{ background: "var(--modal-bg)", color: "var(--text-primary)" }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: "var(--btn-danger)" }}
        >
          Error {errorAction}
        </h2>
        <div className="flex-1 overflow-y-auto">
          <p style={{ color: "var(--text-primary)" }}>{error.toString()}</p>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={clearError}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--btn-danger)",
              color: "var(--btn-text)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
