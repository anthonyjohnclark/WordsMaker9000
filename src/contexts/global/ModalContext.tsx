import React, { createContext, useContext, useState } from "react";

interface IModalContent {
  modalBody: React.ReactNode;
}

interface Props {
  children: React.ReactNode;
}

interface IModalContext {
  show: boolean;
  handleClose: () => void;
  handleShow: () => void;
  renderModal: (modal: IModalContent) => void;
  resetModal: () => void;
  modalContent: IModalContent;
  handleExited: () => void;
  modalContainer: HTMLElement | null;
  setModalContainer: (node: HTMLElement | null) => void;
}

const modalContext = createContext<IModalContext>({} as IModalContext);

// Create the ModalContext
export const useModal = (): IModalContext => {
  return useContext(modalContext);
};

export const ProvideModal = ({ children }: Props): JSX.Element => {
  const identity = useProvideModal();
  return (
    <modalContext.Provider value={identity}>{children}</modalContext.Provider>
  );
};

export const useProvideModal = () => {
  const [show, setShow] = useState(false);

  const [modalContent, setModalContent] = useState<IModalContent>({
    modalBody: (<></>) as React.ReactNode,
  });

  const [modalContainer, setModalContainer] = useState<HTMLElement | null>(
    () => (typeof document !== "undefined" ? document.body : null),
  );

  const handleClose = () => {
    setShow(false);
  };

  const handleExited = () => {
    setModalContent({
      modalBody: (<></>) as React.ReactNode,
    });
  };

  const handleShow = () => setShow(true);

  const [prevModalContent, setPrevModalContent] =
    useState<IModalContent>(modalContent);

  const renderModal = (newModalContent: IModalContent) => {
    setShow(true);

    setPrevModalContent(modalContent);

    setModalContent(newModalContent);
  };

  const resetModal = () => {
    setModalContent(prevModalContent);
  };

  return {
    show,
    handleClose,
    handleShow,
    renderModal,
    modalContent,
    setModalContent,
    resetModal,
    handleExited,
    modalContainer,
    setModalContainer,
  };
};
