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
        className="bg-gray-800 p-6 rounded shadow-lg w-3/5 h-1/3 flex flex-col overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="text-xl font-bold text-red-600 mb-2">
          Error {errorAction}
        </h2>
        <div className="flex-1 overflow-y-auto">
          <p className="text-white">{error.message}</p>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={clearError}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
