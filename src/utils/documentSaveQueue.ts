export interface DocumentSaveQueue {
  enqueue: (save: () => Promise<void>) => Promise<void>;
}

export const createDocumentSaveQueue = (): DocumentSaveQueue => {
  let tail = Promise.resolve();

  return {
    enqueue(save) {
      const queuedSave = tail.then(save, save);
      tail = queuedSave.catch(() => undefined);
      return queuedSave;
    },
  };
};
