import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundSyncWorker } from "../background-sync.js";

test("reports a stopped directory scan before discovered files are indexed", async () => {
  const progress = [];
  let worker;
  const directory = {
    kind: "directory",
    name: "test-directory",
    async *values() {
      yield {
        kind: "file",
        name: "invoice.txt",
        async getFile() {
          return new Blob(["Invoice content"], { type: "text/plain" });
        }
      };
    }
  };
  worker = new BackgroundSyncWorker([directory], (status) => {
    progress.push(status.status);
    if (status.status === "scanning") worker.stop();
  });

  await worker.start();

  assert.deepEqual(progress, ["scanning", "stopped"]);
  assert.equal(worker.isRunning, false);
});

test("partitions local imports larger than the former fifty-file cap", () => {
  const worker = new BackgroundSyncWorker([], () => {});
  const files = Array.from({ length: 51 }, (_, index) => ({ name: `document-${index}.txt` }));

  const batches = worker.partitionFiles(files);

  assert.equal(batches.length, 11);
  assert.equal(batches.flat().length, files.length);
  assert.equal(batches.at(-1).length, 1);
});
