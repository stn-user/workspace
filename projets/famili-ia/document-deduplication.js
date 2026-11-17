const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/i;

function documentHash(document) {
  const candidates = [
    document.sourceContentHash,
    document.photoMetadata?.contentHash
  ];
  return candidates.find(value => typeof value === "string" && SHA256_PATTERN.test(value))?.toLowerCase() ?? null;
}

function normalizedName(document) {
  const rawName = typeof document.name === "string" ? document.name
    : typeof document.originalName === "string" ? document.originalName : "";
  const basename = rawName.split(/[\\/]/).pop() || "";
  const withoutExtension = basename.replace(/\.[^.]+$/, "");
  return withoutExtension.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function identity(document) {
  return {
    sourceId: document.sourceId,
    accountRef: document.accountRef?.toLowerCase() ?? null,
    itemId: document.id,
    name: document.name ?? document.originalName ?? null
  };
}

function pair(first, second, match) {
  const [left, right] = [identity(first), identity(second)]
    .sort((a, b) => JSON.stringify([a.sourceId, a.accountRef, a.itemId])
      .localeCompare(JSON.stringify([b.sourceId, b.accountRef, b.itemId])));
  return { first: left, second: right, match };
}

export function findDocumentDuplicateCandidates(documents) {
  if (!Array.isArray(documents)) throw new TypeError("Les documents doivent être un tableau");
  const identities = new Set();
  const exactByHash = new Map();
  const namesBySource = new Map();

  for (const document of documents) {
    if (!document || typeof document !== "object" || Array.isArray(document) ||
        typeof document.id !== "string" || !document.id.trim() ||
        typeof document.sourceId !== "string" || !document.sourceId.trim() ||
        (document.accountRef !== undefined && document.accountRef !== null &&
          (typeof document.accountRef !== "string" || !/^[0-9a-f]{64}$/i.test(document.accountRef)))) {
      throw new TypeError("Chaque document doit avoir une source et une identité non vides");
    }
    const accountRef = document.accountRef?.toLowerCase() ?? null;
    const key = JSON.stringify([document.sourceId, accountRef, document.id]);
    if (identities.has(key)) throw new TypeError("Identités dupliquées dans les documents");
    identities.add(key);

    const hash = documentHash(document);
    if (hash) {
      if (!exactByHash.has(hash)) exactByHash.set(hash, []);
      exactByHash.get(hash).push(document);
    }
    const name = normalizedName(document);
    if (name) {
      if (!namesBySource.has(name)) namesBySource.set(name, []);
      namesBySource.get(name).push({ document, hash });
    }
  }

  const exactDuplicates = [];
  for (const group of exactByHash.values()) {
    for (let first = 0; first < group.length; first += 1) {
      for (let second = first + 1; second < group.length; second += 1) {
        exactDuplicates.push(pair(group[first], group[second], "content-hash"));
      }
    }
  }

  const possibleDuplicates = [];
  for (const group of namesBySource.values()) {
    for (let first = 0; first < group.length; first += 1) {
      for (let second = first + 1; second < group.length; second += 1) {
        const left = group[first];
        const right = group[second];
        if (left.document.sourceId === right.document.sourceId ||
            (left.hash && right.hash)) continue;
        possibleDuplicates.push(pair(left.document, right.document, "same-normalized-name"));
      }
    }
  }

  const sortPairs = (items) => items.sort((a, b) =>
    JSON.stringify([a.first.sourceId, a.first.accountRef, a.first.itemId,
      a.second.sourceId, a.second.accountRef, a.second.itemId])
      .localeCompare(JSON.stringify([b.first.sourceId, b.first.accountRef, b.first.itemId,
        b.second.sourceId, b.second.accountRef, b.second.itemId])));
  return {
    exactDuplicates: sortPairs(exactDuplicates),
    possibleDuplicates: sortPairs(possibleDuplicates)
  };
}
