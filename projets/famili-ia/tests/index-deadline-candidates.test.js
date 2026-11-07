import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIndexRecord } from "../index-record.js";
import { findDeadlineCandidates, isValidCalendarDate } from "../index-deadline-candidates.js";

describe("isValidCalendarDate", () => {
  it("valide une date calendaire valide", () => {
    assert.equal(isValidCalendarDate("2024-01-15"), true);
  });

  describe("limites calendaires et états multiples", () => {
    const entry = (sourceId, itemId, value, options = {}) => createIndexRecord(sourceId, itemId, {
      name: { value: "Contrat", source: "provider" },
      dates: { echeance: {
        value, source: options.estimated ? "auto-estimate" : "extracted",
        estimated: options.estimated === true,
        proof: options.noProof ? null : { excerpt: "Échéance fictive", location: "page 1" }
      } }
    });

    it("inclut les bornes et calcule les jours exacts sur un mois bissextile", () => {
      const records = [
        entry("s", "before", "2024-02-27"), entry("s", "today", "2024-02-28"),
        entry("s", "leap", "2024-02-29"), entry("s", "limit", "2024-03-01"),
        entry("s", "after", "2024-03-02")
      ];
      const result = findDeadlineCandidates(records, "2024-02-28", 2);
      assert.deepEqual(result.candidates.map(({ itemId, daysUntil }) => ({ itemId, daysUntil })), [
        { itemId: "today", daysUntil: 0 }, { itemId: "leap", daysUntil: 1 }, { itemId: "limit", daysUntil: 2 }
      ]);
      assert.deepEqual(result.ineligible, []);
      assert.deepEqual(findDeadlineCandidates(records, "2024-02-28", 0).candidates.map((c) => c.itemId), ["today"]);
    });

    it("gère le passage d'année et les années inférieures à 100", () => {
      assert.equal(findDeadlineCandidates([entry("s", "1", "2025-01-01")], "2024-12-31", 1).candidates[0].daysUntil, 1);
      assert.equal(findDeadlineCandidates([entry("s", "1", "0099-12-31")], "0099-12-30", 1).candidates[0].daysUntil, 1);
      assert.equal(isValidCalendarDate("2024-0x-01"), false);
      assert.equal(isValidCalendarDate("0099-12-30"), true);
    });

    it("cumule tous les motifs d'inéligibilité et préserve la preuve retournée", () => {
      const uncertain = createIndexRecord("s", "uncertain", { dates: {
        echeance: { value: "2024-03-18T10:00:00Z", source: "auto-estimate" }
      } });
      const good = entry("s", "good", "2024-03-18");
      const snapshot = structuredClone([uncertain, good]);
      const result = findDeadlineCandidates([uncertain, good], "2024-03-15", 10);
      assert.deepEqual(result.ineligible, [{
        sourceId: "s", itemId: "uncertain",
        reasons: ["date-heure non prise en charge", "échéance estimée", "preuve absente"]
      }]);
      assert.deepEqual(result.candidates[0], {
        sourceId: "s", itemId: "good", name: "Contrat", dueDate: "2024-03-18",
        source: "extracted", proof: { excerpt: "Échéance fictive", location: "page 1" }, daysUntil: 3
      });
      result.candidates[0].proof.excerpt = "modifié";
      assert.deepEqual([uncertain, good], snapshot);
    });

    it("distingue les paires contenant un séparateur et rejette les périodes non sûres", () => {
      const records = [entry("a|b", "c", "2024-03-18"), entry("a", "b|c", "2024-03-18")];
      assert.equal(findDeadlineCandidates(records, "2024-03-15", 3).candidates.length, 2);
      assert.throws(() => findDeadlineCandidates(records, "2024-03-15", Number.MAX_SAFE_INTEGER + 1), TypeError);
      assert.equal(findDeadlineCandidates(records, "2024-03-15", Number.MAX_SAFE_INTEGER).candidates.length, 2);
    });
  });

  it("rejette une date invalide", () => {
    assert.equal(isValidCalendarDate("2024-13-01"), false);
    assert.equal(isValidCalendarDate("2024-02-30"), false);
    assert.equal(isValidCalendarDate("2023-02-29"), false);
    assert.equal(isValidCalendarDate("invalid"), false);
    assert.equal(isValidCalendarDate(null), false);
  });

  it("reconnaît une année bissextile", () => {
    assert.equal(isValidCalendarDate("2024-02-29"), true);
    assert.equal(isValidCalendarDate("2020-02-29"), true);
  });
});

describe("findDeadlineCandidates", () => {
  const referenceDate = "2024-03-15";
  const daysToExamine = 7;

  it("retourne des candidats valides avec échéance dans la période", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance paiement", location: "page 2" }
        }
      }
    });

    const result = findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceId, "source1");
    assert.equal(result.candidates[0].itemId, "item1");
    assert.equal(result.candidates[0].dueDate, "2024-03-18");
    assert.equal(result.candidates[0].daysUntil, 3);
    assert.equal(result.ineligible.length, 0);
  });

  it("rejette une échéance estimée", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "auto-estimate",
          estimated: true,
          proof: { excerpt: "Estimated", location: "page 2" }
        }
      }
    });

    const result = findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.ineligible.length, 1);
    assert.deepEqual(result.ineligible[0].reasons, ["échéance estimée"]);
  });

  it("rejette une échéance sans preuve", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "provider",
          estimated: false
        }
      }
    });

    const result = findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.ineligible.length, 1);
    assert.deepEqual(result.ineligible[0].reasons, ["preuve absente"]);
  });

  it("ignore les fiches sans échéance", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      name: { value: "Document sans échéance", source: "provider" }
    });

    const result = findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.ineligible.length, 0);
  });

  it("conserve l'ordre des fiches en entrée", () => {
    const record1 = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-16",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance 1", location: "page 1" }
        }
      }
    });

    const record2 = createIndexRecord("source2", "item2", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-20",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance 2", location: "page 2" }
        }
      }
    });

    const result = findDeadlineCandidates([record1, record2], referenceDate, daysToExamine);

    assert.equal(result.candidates[0].itemId, "item1");
    assert.equal(result.candidates[1].itemId, "item2");
  });

  it("gère deux sources avec le même itemId", () => {
    const record1 = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance 1", location: "page 1" }
        }
      }
    });

    const record2 = createIndexRecord("source2", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-19",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance 2", location: "page 2" }
        }
      }
    });

    const result = findDeadlineCandidates([record1, record2], referenceDate, daysToExamine);

    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].sourceId, "source1");
    assert.equal(result.candidates[1].sourceId, "source2");
  });

  it("inclut la provenance et la preuve dans la candidature", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "extracted",
          estimated: false,
          proof: {
            excerpt: "Extraits du document",
            location: "page 2, ligne 5"
          }
        }
      }
    });

    const result = findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.equal(result.candidates[0].source, "extracted");
    assert.deepEqual(result.candidates[0].proof, {
      excerpt: "Extraits du document",
      location: "page 2, ligne 5"
    });
  });

  it("rejette les fiches invalides", () => {
    const invalidRecord = { sourceId: "source1" };

    assert.throws(() => {
      findDeadlineCandidates([invalidRecord], referenceDate, daysToExamine);
    }, /fiche d'index invalide/);
  });

  it("rejette un tableau invalide", () => {
    assert.throws(() => {
      findDeadlineCandidates("not an array", referenceDate, daysToExamine);
    }, /records doit être un tableau/);
  });

  it("rejette une date de référence invalide", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document"
    });

    assert.throws(() => {
      findDeadlineCandidates([record], "invalid-date", daysToExamine);
    }, /date de référence invalide/);
  });

  it("rejette un nombre de jours négatif", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document"
    });

    assert.throws(() => {
      findDeadlineCandidates([record], referenceDate, -1);
    }, /nombre de jours invalide/);
  });

  it("rejette un nombre de jours décimal", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document"
    });

    assert.throws(() => {
      findDeadlineCandidates([record], referenceDate, 3.5);
    }, /nombre de jours invalide/);
  });

  it("rejette les identités dupliquées", () => {
    const record1 = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance", location: "page 1" }
        }
      }
    });

    const record2 = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-19",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance", location: "page 2" }
        }
      }
    });

    assert.throws(() => {
      findDeadlineCandidates([record1, record2], referenceDate, daysToExamine);
    }, /identités dupliquées/);
  });

  it("ne modifie pas les objets d'entrée", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document",
      dates: {
        echeance: {
          value: "2024-03-18",
          source: "provider",
          estimated: false,
          proof: { excerpt: "Échéance", location: "page 1" }
        }
      }
    });

    const originalRecord = JSON.parse(JSON.stringify(record));

    findDeadlineCandidates([record], referenceDate, daysToExamine);

    assert.deepEqual(record, originalRecord);
  });

  it("propage les erreurs sans les masquer", () => {
    const record = createIndexRecord("source1", "item1", {
      type: "document"
    });

    assert.throws(() => {
      findDeadlineCandidates([record], "2024-13-45", 7);
    });
  });
});
