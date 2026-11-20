import { DROPBOX_SCOPES } from "./dropbox.js";
import { createPkcePair } from "./google-native-auth.js";

const BROWSER_CLOSED_GRACE_MS = 1500;
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Connexion Dropbox (PKCE) dans le navigateur système pour l'application mobile.
 * Même interface que DropboxAuth ; jeton en mémoire, lecture seule.
 */
export class DropboxNativeAuth {
  #token = null;
  #expiresAt = 0;
  #accountId = null;
  #connecting = false;
  #cancel = null;

  constructor({ clientId, redirectUri, browser, app, fetchImpl = (...args) => fetch(...args), cryptoImpl = globalThis.crypto }) {
    if (!clientId || !redirectUri || !browser || !app) throw new TypeError("Configuration Dropbox native incomplète.");
    Object.assign(this, { clientId, redirectUri });
    this.browser = browser;
    this.app = app;
    this.fetchImpl = fetchImpl;
    this.crypto = cryptoImpl;
  }

  async initialize() {}

  get connected() { return Boolean(this.#token) && Date.now() < this.#expiresAt; }
  get accountId() {
    if (!this.connected) throw new Error("Connectez ou reconnectez Dropbox.");
    return this.#accountId;
  }
  getToken() {
    if (!this.connected) throw new Error("Session Dropbox expirée ou indisponible : reconnectez Dropbox.");
    return this.#token;
  }
  disconnect() {
    this.cancelConnection();
    this.#token = null;
    this.#accountId = null;
    this.#expiresAt = 0;
  }
  cancelConnection() { this.#cancel?.(); }

  async connect() {
    if (this.#connecting) throw new Error("Une connexion Dropbox est déjà en cours.");
    this.#connecting = true;
    const listeners = [];
    try {
      const { verifier, challenge } = await createPkcePair(this.crypto);
      const state = Array.from(this.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      const url = new URL("https://www.dropbox.com/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: this.clientId, response_type: "code", redirect_uri: this.redirectUri,
        code_challenge_method: "S256", code_challenge: challenge,
        state, scope: DROPBOX_SCOPES.join(" "), token_access_type: "online"
      }).toString();

      const callbackUrl = await new Promise((resolve, reject) => {
        let grace = null;
        const watchdog = setTimeout(() => reject(new Error("Délai de connexion Dropbox dépassé.")), AUTHORIZATION_TIMEOUT_MS);
        const settle = (value) => { clearTimeout(watchdog); clearTimeout(grace); resolve(value); };
        this.#cancel = () => settle(null);
        Promise.all([
          this.app.addListener("appUrlOpen", (event) => {
            if (typeof event?.url === "string" && event.url.startsWith(this.redirectUri)) settle(event.url);
          }),
          this.browser.addListener("browserFinished", () => {
            grace = setTimeout(() => settle(null), BROWSER_CLOSED_GRACE_MS);
          })
        ]).then((handles) => {
          listeners.push(...handles);
          return this.browser.open({ url: url.href });
        }).catch((error) => { clearTimeout(watchdog); reject(error); });
      });
      await this.browser.close().catch(() => {});
      if (!callbackUrl) throw new Error("Connexion Dropbox annulée.");

      const params = new URL(callbackUrl).searchParams;
      if (params.get("state") !== state) throw new Error("Retour Dropbox invalide : état de connexion incohérent.");
      const code = params.get("code");
      if (params.get("error") || !code) throw new Error("Autorisation Dropbox refusée ou incomplète.");

      const response = await this.fetchImpl("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, client_id: this.clientId,
          redirect_uri: this.redirectUri, code_verifier: verifier
        }).toString()
      });
      if (!response.ok) throw new Error(`Connexion Dropbox impossible (HTTP ${response.status}).`);
      const token = await response.json();
      const granted = typeof token.scope === "string" ? token.scope.split(/\s+/) : [];
      if (typeof token.access_token !== "string" || !token.access_token ||
          typeof token.account_id !== "string" || !token.account_id ||
          !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
          token.token_type?.toLowerCase() !== "bearer" ||
          !DROPBOX_SCOPES.every((scope) => granted.includes(scope)) ||
          granted.some((scope) => !DROPBOX_SCOPES.includes(scope))) {
        throw new Error("Réponse Dropbox invalide ou permissions différentes de la lecture seule attendue.");
      }
      this.#token = token.access_token;
      this.#accountId = token.account_id;
      this.#expiresAt = Date.now() + token.expires_in * 1000;
    } finally {
      await Promise.all(listeners.map((handle) => handle?.remove?.()));
      this.#connecting = false;
      this.#cancel = null;
    }
  }
}
