const graphOrigin = "https://graph.microsoft.com";
const rootChildren = `${graphOrigin}/v1.0/me/drive/root/children`;

function graphUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Adresse de pagination OneDrive invalide.");
  }
  if (url.origin !== graphOrigin || url.username || url.password || !url.pathname.startsWith("/v1.0/me/drive/")) {
    throw new TypeError("Adresse de pagination OneDrive non autorisée.");
  }
  return url;
}

export async function scanOneDrive({ getToken, onItem, onProgress, signal, fetchImpl = fetch }) {
  if (typeof getToken !== "function" || typeof onItem !== "function" ||
      typeof onProgress !== "function" || typeof fetchImpl !== "function") {
    throw new TypeError("Paramètres d'indexation OneDrive invalides.");
  }
  const folders = [null];
  const visitedFolders = new Set();
  const visitedPages = new Set();
  const visitedItems = new Set();
  let count = 0;
  let pages = 0;
  let foldersRead = 0;
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("Indexation OneDrive arrêtée.", "AbortError");
  };

  while (folders.length) {
    checkCancelled();
    const folderId = folders.shift();
    let next = folderId === null
      ? rootChildren
      : `${graphOrigin}/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`;
    while (next !== null) {
      checkCancelled();
      const url = graphUrl(next);
      if (visitedPages.has(url.href)) throw new Error("Pagination OneDrive répétée : indexation interrompue.");
      visitedPages.add(url.href);
      const token = await getToken();
      if (typeof token !== "string" || !token) throw new Error("Jeton OneDrive indisponible.");
      checkCancelled();
      const response = await fetchImpl(url.href, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!response.ok) throw new Error(`Lecture OneDrive impossible (HTTP ${response.status}).`);
      const page = await response.json();
      if (!page || !Array.isArray(page.value)) throw new Error("Page OneDrive invalide.");
      if (page["@odata.nextLink"] !== undefined && typeof page["@odata.nextLink"] !== "string") {
        throw new Error("Curseur OneDrive invalide.");
      }
      next = page["@odata.nextLink"] ?? null;
      if (next !== null) graphUrl(next);
      pages += 1;
      for (const item of page.value) {
        checkCancelled();
        if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) {
          throw new Error("Élément OneDrive sans identité ou nom valide.");
        }
        if (item.folder && !visitedFolders.has(item.id)) {
          visitedFolders.add(item.id);
          folders.push(item.id);
        } else if (item.file && !visitedItems.has(item.id)) {
          visitedItems.add(item.id);
          await onItem(item);
          count += 1;
          onProgress({ files: count, pages, foldersRead, pendingFolders: folders.length });
        }
      }
    }
    foldersRead += 1;
    onProgress({ files: count, pages, foldersRead, pendingFolders: folders.length });
  }
  return { files: count, pages, foldersRead };
}
