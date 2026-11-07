import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  readSourcePage,
  collectSourcePages,
  collectMultipleSources
} from "../source-orchestrator.js";
import { FakeSourceConnector } from "./fixtures/fake-source-connector.js";

const createItems = (count) => {
  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push({ id: `item-${i}`, name: `Document ${i}`, content: "Contenu fictif" });
  }
  return items;
};

describe("readSourcePage", () => {
  test("lit une page avec succès", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(5),
      pageSize: 2
    });
    connector.authorize("allow");

    const page = await readSourcePage(connector);

    assert.equal(page.items.length, 2);
    assert.equal(page.done, false);
    assert.equal(page.nextCursor.offset, 2);
  });

  test("rejette un connecteur invalide", async () => {
    await assert.rejects(
      () => readSourcePage(null, null),
      Error
    );
  });
});

describe("collectSourcePages", () => {
  test("collecte 0 éléments (source vide)", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "empty",
      items: createItems(0),
      pageSize: 2
    });
    connector.authorize("allow");

    const result = await collectSourcePages(connector);

    assert.deepEqual(result.items, []);
    assert.equal(result.pagesRead, 1);
  });

  test("collecte une page unique", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(3),
      pageSize: 10
    });
    connector.authorize("allow");

    const result = await collectSourcePages(connector);

    assert.equal(result.items.length, 3);
    assert.equal(result.pagesRead, 1);
  });

  test("collecte plusieurs pages", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(5),
      pageSize: 2
    });
    connector.authorize("allow");

    const result = await collectSourcePages(connector);

    assert.equal(result.items.length, 5);
    assert.equal(result.pagesRead, 3);
  });

  test("limite maxPages avant la fin", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(100),
      pageSize: 1
    });
    connector.authorize("allow");

    await assert.rejects(
      () => collectSourcePages(connector, { maxPages: 5 }),
      /Limite de pages/
    );
  });

  test("rejette maxPages invalide", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(5),
      pageSize: 2
    });
    connector.authorize("allow");

    await assert.rejects(
      () => collectSourcePages(connector, { maxPages: 0 }),
      Error
    );
  });

  test("propage l'erreur du connecteur", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(5),
      pageSize: 2
    });

    await assert.rejects(
      () => collectSourcePages(connector),
      Error
    );
  });

  test("utilise un curseur initial", async () => {
    const connector = new FakeSourceConnector({
      sourceId: "test",
      items: createItems(5),
      pageSize: 2
    });
    connector.authorize("allow");

    // Première collecte
    const firstResult = await collectSourcePages(connector);
    assert.equal(firstResult.items.length, 5);

    // Deuxième collecte avec curseur pour récupérer les 3 items suivants
    const connector2 = new FakeSourceConnector({
      sourceId: "test2",
      items: createItems(8),
      pageSize: 2
    });
    connector2.authorize("allow");

    // Collecte depuis l'offset 2
    const resumed = await collectSourcePages(connector2, { cursor: { sourceId: "test2", revision: 0, offset: 2 } });
    assert.deepEqual(resumed.items.map((item) => item.id), ["item-3", "item-4", "item-5", "item-6", "item-7", "item-8"]);
  });

  test("accepte une dernière page exactement à la limite et les curseurs opaques", async () => {
    const seen = [];
    const connector = {
      async discover(cursor) {
        seen.push(cursor);
        if (cursor === "start") return { items: [], nextCursor: "next", done: false };
        return { items: [{ id: "result" }], nextCursor: null, done: true };
      }
    };
    assert.deepEqual(await collectSourcePages(connector, { cursor: "start", maxPages: 2 }), {
      items: [{ id: "result" }], pagesRead: 2
    });
    assert.deepEqual(seen, ["start", "next"]);
    assert.deepEqual(await collectSourcePages({ discover: () => ({ items: [], nextCursor: null, done: true }) }, { maxPages: 1 }), {
      items: [], pagesRead: 1
    });
  });

  test("rejette les pages mal formées et les états de fin incohérents", async () => {
    const pages = [
      null,
      [],
      { items: null, done: true, nextCursor: null },
      { items: [], done: "true", nextCursor: null },
      { items: [], done: false },
      { items: [], done: false, nextCursor: null },
      { items: [], done: true, nextCursor: "next" }
    ];
    for (const page of pages) {
      await assert.rejects(readSourcePage({ discover: () => page }), /Page de découverte invalide/);
    }
  });

  test("limite une pagination infinie et propage l'erreur exacte en cours de parcours", async () => {
    let calls = 0;
    const endless = { discover: () => { calls += 1; return { items: [], done: false, nextCursor: "next" }; } };
    await assert.rejects(collectSourcePages(endless, { maxPages: 3 }), /Limite de pages/);
    assert.equal(calls, 3);

    const failure = new Error("erreur fictive");
    const broken = { discover: (cursor) => {
      if (cursor === null) return { items: [{ id: "first" }], done: false, nextCursor: "next" };
      throw failure;
    } };
    await assert.rejects(collectSourcePages(broken), (error) => error === failure);
  });

  test("reprend explicitement après indisponibilité sans modifier le curseur", async () => {
    const cursor = Object.freeze({ offset: 1 });
    const pageItems = Object.freeze([{ id: "second" }]);
    let available = false;
    const connector = {
      discover(received) {
        assert.equal(received, cursor);
        if (!available) throw new Error("indisponible");
        return { items: pageItems, done: true, nextCursor: null };
      }
    };
    await assert.rejects(readSourcePage(connector, cursor), /indisponible/);
    available = true;
    assert.equal((await readSourcePage(connector, cursor)).items, pageItems);
    assert.deepEqual(cursor, { offset: 1 });
  });

  test("valide la configuration globale avant tout appel, même sans source", async () => {
    let calls = 0;
    const connector = { discover() { calls += 1; return { items: [], done: true, nextCursor: null }; } };
    await assert.rejects(collectMultipleSources([{ sourceId: "a", connector }], { maxPages: 0 }), TypeError);
    await assert.rejects(collectMultipleSources([], { maxPages: 0 }), TypeError);
    await assert.rejects(collectMultipleSources([{ sourceId: "a", connector }, { sourceId: "a", connector }]), /dupliqué/);
    await assert.rejects(collectMultipleSources([{ sourceId: "a", connector }, { sourceId: "b", connector: {} }]), TypeError);
    await assert.rejects(collectMultipleSources([{ sourceId: " ", connector }]), TypeError);
    await assert.rejects(collectMultipleSources([], null), TypeError);
    assert.equal(calls, 0);
  });

  test("isole les résultats et erreurs entre sources, sans fusionner leurs identifiants", async () => {
    const error = new Error("source indisponible");
    const sources = Object.freeze([
      Object.freeze({ sourceId: "a", connector: { discover: () => ({ items: [{ id: "same" }], done: true, nextCursor: null }) } }),
      Object.freeze({ sourceId: "b", connector: { discover: async () => ({ items: [{ id: "same" }], done: true, nextCursor: null }) } }),
      Object.freeze({ sourceId: "c", connector: { discover: () => { throw error; } } })
    ]);
    const options = Object.freeze({ maxPages: 2 });
    const results = await collectMultipleSources(sources, options);
    assert.deepEqual(results.slice(0, 2), [
      { sourceId: "a", status: "success", items: [{ id: "same" }], pagesRead: 1 },
      { sourceId: "b", status: "success", items: [{ id: "same" }], pagesRead: 1 }
    ]);
    assert.equal(results[2].status, "error");
    assert.equal(results[2].error, error);
    assert.equal("items" in results[2], false);
    assert.equal(sources.length, 3);
    assert.deepEqual(options, { maxPages: 2 });
  });
});

describe("collectMultipleSources", () => {
  test("collecte avec succès", async () => {
    const source1 = new FakeSourceConnector({
      sourceId: "source1",
      items: createItems(3),
      pageSize: 2
    });
    source1.authorize("allow");

    const source2 = new FakeSourceConnector({
      sourceId: "source2",
      items: createItems(2),
      pageSize: 2
    });
    source2.authorize("allow");

    const results = await collectMultipleSources([
      { sourceId: "source1", connector: source1 },
      { sourceId: "source2", connector: source2 }
    ]);

    assert.equal(results.length, 2);
    assert.equal(results[0].sourceId, "source1");
    assert.equal(results[0].status, "success");
    assert.equal(results[0].items.length, 3);
    assert.equal(results[1].sourceId, "source2");
    assert.equal(results[1].status, "success");
    assert.equal(results[1].items.length, 2);
  });

  test("gère une erreur sans bloquer les autres", async () => {
    const source1 = new FakeSourceConnector({
      sourceId: "source1",
      items: createItems(3),
      pageSize: 2
    });
    source1.authorize("allow");

    const source2 = new FakeSourceConnector({
      sourceId: "source2",
      items: createItems(2),
      pageSize: 2
    });

    const results = await collectMultipleSources([
      { sourceId: "source1", connector: source1 },
      { sourceId: "source2", connector: source2 }
    ]);

    assert.equal(results[0].status, "success");
    assert.equal(results[1].status, "error");
    assert.ok(results[1].error instanceof Error);
  });

  test("rejette les sourceIds dupliqués", async () => {
    const source1 = new FakeSourceConnector({
      sourceId: "duplicate",
      items: createItems(3),
      pageSize: 2
    });
    source1.authorize("allow");

    await assert.rejects(
      () => collectMultipleSources([
        { sourceId: "duplicate", connector: source1 },
        { sourceId: "duplicate", connector: source1 }
      ]),
      /sourceId dupliqué/
    );
  });

  test("préserve l'ordre des sources", async () => {
    const connector1 = new FakeSourceConnector({
      sourceId: "source-b",
      items: createItems(1),
      pageSize: 2
    });
    connector1.authorize("allow");

    const connector2 = new FakeSourceConnector({
      sourceId: "source-a",
      items: createItems(1),
      pageSize: 2
    });
    connector2.authorize("allow");

    const results = await collectMultipleSources([
      { sourceId: "source-b", connector: connector1 },
      { sourceId: "source-a", connector: connector2 }
    ]);

    assert.equal(results[0].sourceId, "source-b");
    assert.equal(results[1].sourceId, "source-a");
  });
});