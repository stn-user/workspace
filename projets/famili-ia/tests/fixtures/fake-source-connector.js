// Test fixture only: no network, persistence, real permissions or user data.
export class FakeSourceError extends Error {
  constructor(code) {
    super(`Source fictive : ${code}`);
    this.name = "FakeSourceError";
    this.code = code;
  }
}

export class FakeSourceConnector {
  constructor({ sourceId, items, pageSize = 2 }) {
    if (typeof sourceId !== "string" || !sourceId || !Array.isArray(items) ||
        !Number.isInteger(pageSize) || pageSize < 1) {
      throw new TypeError("Configuration de source fictive invalide");
    }
    this.sourceId = sourceId;
    this.pageSize = pageSize;
    this.authorized = false;
    this.available = true;
    this.revision = 0;
    this.items = new Map();
    this.changes = [];
    for (const item of items) {
      if (typeof item.id !== "string" || !item.id ||
          typeof item.name !== "string" || typeof item.content !== "string" ||
          this.items.has(item.id)) {
        throw new TypeError("Élément fictif invalide");
      }
      this.items.set(item.id, { id: item.id, name: item.name, content: item.content });
    }
  }

  describe() {
    return {
      sourceId: this.sourceId,
      authorized: this.authorized,
      available: this.available,
      capabilities: {
        discover: true,
        readMetadata: true,
        readContent: true,
        openOriginal: false,
        getChanges: true,
        disconnect: true,
        revoke: true
      }
    };
  }

  authorize(decision) {
    if (decision === "cancel") throw new FakeSourceError("cancelled");
    if (decision === "deny") throw new FakeSourceError("permission-denied");
    if (decision !== "allow") throw new TypeError("Décision fictive invalide");
    this.authorized = true;
  }

  ensureAccess() {
    if (!this.authorized) throw new FakeSourceError("unauthorized");
    if (!this.available) throw new FakeSourceError("unavailable");
  }

  discover(cursor = null) {
    this.ensureAccess();
    let offset = 0;
    if (cursor !== null) {
      if (!cursor || cursor.sourceId !== this.sourceId ||
          cursor.revision !== this.revision || !Number.isInteger(cursor.offset) ||
          cursor.offset < 0 || cursor.offset >= this.items.size) {
        throw new FakeSourceError("invalid-cursor");
      }
      offset = cursor.offset;
    }
    const items = Array.from(this.items.values())
      .slice(offset, offset + this.pageSize)
      .map(({ id, name }) => ({ id, name }));
    const nextOffset = offset + items.length;
    const nextCursor = nextOffset < this.items.size
      ? { sourceId: this.sourceId, revision: this.revision, offset: nextOffset }
      : null;
    return { items, nextCursor, done: nextCursor === null };
  }

  readMetadata(id) {
    this.ensureAccess();
    const item = this.items.get(id);
    if (!item) throw new FakeSourceError("not-found");
    return { id: item.id, name: item.name };
  }

  readContent(id) {
    this.ensureAccess();
    const item = this.items.get(id);
    if (!item) throw new FakeSourceError("not-found");
    return { content: item.content, contentType: "text/plain" };
  }

  openOriginal() {
    throw new FakeSourceError("unsupported");
  }

  getChanges(cursor = 0) {
    this.ensureAccess();
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.changes.length) {
      throw new FakeSourceError("invalid-cursor");
    }
    return {
      changes: this.changes.slice(cursor).map((change) => ({ ...change })),
      nextCursor: this.changes.length
    };
  }

  disconnect() {
    this.authorized = false;
  }

  revoke() {
    this.authorized = false;
  }

  // Simulation controls below do not represent connector operations.
  setAvailable(available) {
    if (typeof available !== "boolean") throw new TypeError("Disponibilité fictive invalide");
    this.available = available;
  }

  updateItem(id, { name, content }) {
    const item = this.items.get(id);
    if (!item) throw new FakeSourceError("not-found");
    if (typeof name !== "string" || typeof content !== "string") {
      throw new TypeError("Modification fictive invalide");
    }
    this.items.set(id, { id, name, content });
    this.changes.push({ id, type: "updated" });
    this.revision += 1;
  }

  deleteItem(id) {
    if (!this.items.delete(id)) throw new FakeSourceError("not-found");
    this.changes.push({ id, type: "deleted" });
    this.revision += 1;
  }
}
