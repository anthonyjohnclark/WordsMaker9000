import { createDocumentSaveQueue } from "./documentSaveQueue";

describe("createDocumentSaveQueue", () => {
  it("runs a flush after an older save so the latest buffer wins", async () => {
    const queue = createDocumentSaveQueue();
    const writes: string[] = [];
    let finishOlderSave: (() => void) | undefined;

    const olderSave = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          finishOlderSave = () => {
            writes.push("older");
            resolve();
          };
        }),
    );
    const flush = queue.enqueue(async () => {
      writes.push("latest");
    });

    await Promise.resolve();
    expect(writes).toEqual([]);

    finishOlderSave?.();
    await Promise.all([olderSave, flush]);

    expect(writes).toEqual(["older", "latest"]);
  });

  it("continues with a flush after an earlier save fails", async () => {
    const queue = createDocumentSaveQueue();
    const failedSave = queue.enqueue(async () => {
      throw new Error("old save failed");
    });
    const flush = queue.enqueue(async () => undefined);

    await expect(failedSave).rejects.toThrow("old save failed");
    await expect(flush).resolves.toBeUndefined();
  });
});
