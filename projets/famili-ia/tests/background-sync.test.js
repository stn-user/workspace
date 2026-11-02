import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundSyncWorker } from "../background-sync.js";

test("stops a directory scan before discovered files are indexed", async () => {
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

  assert.deepEqual(progress, ["scanning", "completed"]);
  assert.equal(worker.isRunning, false);
});
