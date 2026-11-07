import assert from "node:assert/strict";
import test from "node:test";
import { FakeSourceConnector, FakeSourceError } from "./fixtures/fake-source-connector.js";

function createSource(sourceId = "source-a") {
  return new FakeSourceConnector({
    sourceId,
    pageSize: 1,
    items: [
      { id: "invoice", name: "Facture.txt", content: "Montant : 42 euros" },
      { id: "warranty", name: "Garantie.txt", content: "Fin : 01/01/2028" }
    ]
  });
}

function hasCode(code) {
  return (error) => error instanceof FakeSourceError && error.code === code;
}

test("distinguishes cancellation, denial and explicit authorization", () => {
  const source = createSource();
  assert.throws(() => source.discover(), hasCode("unauthorized"));
  assert.throws(() => source.authorize("cancel"), hasCode("cancelled"));
  assert.throws(() => source.authorize("deny"), hasCode("permission-denied"));
  assert.equal(source.describe().authorized, false);
  source.authorize("allow");
  assert.equal(source.describe().authorized, true);
  assert.equal(source.describe().capabilities.openOriginal, false);
  assert.throws(() => source.openOriginal(), hasCode("unsupported"));
});

test("paginates and resumes without reading content or duplicating items", () => {
  const source = createSource();
  source.authorize("allow");
  const first = source.discover();
  assert.deepEqual(first.items, [{ id: "invoice", name: "Facture.txt" }]);
  assert.equal(first.done, false);
  const next = source.discover(first.nextCursor);
  assert.deepEqual(next.items, [{ id: "warranty", name: "Garantie.txt" }]);
  assert.equal(next.done, true);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(source.readMetadata("invoice"), { id: "invoice", name: "Facture.txt" });
  assert.deepEqual(source.readContent("invoice"), { content: "Montant : 42 euros", contentType: "text/plain" });
  assert.throws(() => source.readContent("missing"), hasCode("not-found"));
});

test("signals unavailability and resumes with the previous cursor after recovery", () => {
  const source = createSource();
  source.authorize("allow");
  const first = source.discover();
  source.setAvailable(false);
  assert.throws(() => source.discover(first.nextCursor), hasCode("unavailable"));
  assert.throws(() => source.readContent("invoice"), hasCode("unavailable"));
  source.setAvailable(true);
  assert.equal(source.discover(first.nextCursor).items[0].id, "warranty");
});

test("tracks changes and deletion, rejecting a cursor from an outdated listing", () => {
  const source = createSource();
  source.authorize("allow");
  const previous = source.discover().nextCursor;
  const checkpoint = source.getChanges().nextCursor;
  source.updateItem("invoice", { name: "Facture renommée.txt", content: "Montant : 43 euros" });
  source.deleteItem("warranty");
  assert.throws(() => source.discover(previous), hasCode("invalid-cursor"));
  assert.deepEqual(source.getChanges(checkpoint), {
    changes: [{ id: "invoice", type: "updated" }, { id: "warranty", type: "deleted" }],
    nextCursor: 2
  });
  assert.deepEqual(source.getChanges(2), { changes: [], nextCursor: 2 });
  assert.equal(source.readMetadata("invoice").name, "Facture renommée.txt");
  assert.throws(() => source.readMetadata("warranty"), hasCode("not-found"));
});

test("isolates separate sources and distinguishes disconnection from revocation", () => {
  const first = createSource("source-a");
  const second = createSource("source-b");
  first.authorize("allow");
  second.authorize("allow");
  const cursor = first.discover().nextCursor;
  assert.throws(() => second.discover(cursor), hasCode("invalid-cursor"));
  first.disconnect();
  assert.throws(() => first.readMetadata("invoice"), hasCode("unauthorized"));
  assert.equal(second.readMetadata("invoice").name, "Facture.txt");
  first.authorize("allow");
  first.revoke();
  assert.throws(() => first.getChanges(), hasCode("unauthorized"));
  assert.equal(second.describe().authorized, true);
});

test("rejects malformed configuration and invalid cursors explicitly", () => {
  assert.throws(() => new FakeSourceConnector({ sourceId: "", items: [] }), TypeError);
  assert.throws(() => new FakeSourceConnector({ sourceId: "a", items: [], pageSize: 0 }), TypeError);
  const source = createSource();
  source.authorize("allow");
  assert.throws(() => source.discover({ sourceId: "source-a", revision: 0, offset: -1 }), hasCode("invalid-cursor"));
  assert.throws(() => source.getChanges(10), hasCode("invalid-cursor"));
});
