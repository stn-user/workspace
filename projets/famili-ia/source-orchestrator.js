function validateDiscoveryPage(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new Error("Page de découverte invalide : pas un objet");
  }
  if (!Array.isArray(page.items)) {
    throw new Error("Page de découverte invalide : items n'est pas un tableau");
  }
  if (typeof page.done !== "boolean") {
    throw new Error("Page de découverte invalide : done n'est pas un booléen");
  }
  if (page.nextCursor === undefined) {
    throw new Error("Page de découverte invalide : nextCursor est absent");
  }
  if (!page.done && page.nextCursor === null) {
    throw new Error("Page de découverte invalide : done=false avec nextCursor=null");
  }
  if (page.done && page.nextCursor !== null) {
    throw new Error("Page de découverte invalide : done=true avec nextCursor non-null");
  }
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options doit être un objet");
  }
  const { maxPages = 100 } = options;
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new TypeError("maxPages doit être un entier positif");
  }
  return maxPages;
}

export async function readSourcePage(connector, cursor = null) {
  if (!connector || typeof connector.discover !== "function") {
    throw new TypeError("Connecteur invalide : pas de méthode discover");
  }
  const page = await connector.discover(cursor);
  validateDiscoveryPage(page);
  return page;
}

export async function collectSourcePages(connector, options = {}) {
  const maxPages = validateOptions(options);
  const { cursor = null } = options;

  if (!connector || typeof connector.discover !== "function") {
    throw new TypeError("Connecteur invalide : pas de méthode discover");
  }

  const allItems = [];
  let currentCursor = cursor;
  let pagesRead = 0;

  while (pagesRead < maxPages) {
    const page = await readSourcePage(connector, currentCursor);
    for (const item of page.items) allItems.push(item);
    pagesRead++;

    if (page.done) return { items: allItems, pagesRead };
    currentCursor = page.nextCursor;
  }

  throw new Error(`Limite de pages (${maxPages}) atteinte avant la fin`);
}

function validateSources(sources) {
  if (!Array.isArray(sources)) {
    throw new TypeError("sources doit être un tableau");
  }

  const sourceIds = new Set();

  for (const source of sources) {
    if (!source || typeof source !== "object") {
      throw new TypeError("Chaque source doit être un objet");
    }
    if (typeof source.sourceId !== "string" || !source.sourceId.trim()) {
      throw new TypeError("sourceId invalide dans une source");
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error("sourceId dupliqué");
    }
    sourceIds.add(source.sourceId);
    if (!source.connector || typeof source.connector.discover !== "function") {
      throw new TypeError("Connecteur invalide : pas de méthode discover");
    }
  }
}

export async function collectMultipleSources(sources, options = {}) {
  validateSources(sources);
  const maxPages = validateOptions(options);

  const results = [];

  for (const { sourceId, connector } of sources) {
    try {
      const result = await collectSourcePages(connector, { maxPages });
      results.push({
        sourceId,
        status: "success",
        items: result.items,
        pagesRead: result.pagesRead
      });
    } catch (error) {
      results.push({
        sourceId,
        status: "error",
        error
      });
    }
  }

  return results;
}