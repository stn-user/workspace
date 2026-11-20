import { createPkcePair } from "./google-native-auth.js";

const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const SCOPE = "openid profile offline_access Files.Read";
const BROWSER_CLOSED_GRACE_MS = 1500;
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

function randomState(cryptoImpl) {
  return Array.from(cryptoImpl.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function readSubject(idToken) {
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub || null;
  } catch {
    return null;
  }
}

/**
 * Connexion Microsoft par PKCE dans le navigateur système, pour l'application mobile.
 * Même interface que OneDriveAuth ; jetons conservés en mémoire uniquement.
 */
export class OneDriveNativeAuth {
  #clientId;
  #redirectUri;
  #browser;
  #app;
  #fetch;
  #crypto;
  #session = null;
  #pending = false;

  constructor({ clientId, redirectUri, browser, app, fetchImpl = (...args) => fetch(...args), cryptoImpl = globalThis.crypto }) {
    if (!clientId || !redirectUri || !browser || !app) throw new TypeError("Configuration Microsoft native incomplète.");
    this.#clientId = clientId;
    this.#redirectUri = redirectUri;
    this.#browser = browser;
    this.#app = app;
    this.#fetch = fetchImpl;
    this.#crypto = cryptoImpl;
  }

  async initialize() {}

  get connected() { return Boolean(this.#session); }
  get accountId() {
    if (!this.#session) throw new Error("Connectez d'abord OneDrive.");
    return this.#session.accountId;
  }

  async #requestToken(params) {
    const response = await this.#fetch(`${AUTHORITY}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.#clientId, scope: SCOPE, ...params }).toString()
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description || body.error || `erreur ${response.status}`);
    }
    return body;
  }

  async #waitForRedirect(url) {
    const listeners = [];
    try {
      return await new Promise((resolve, reject) => {
        let grace = null;
        const watchdog = setTimeout(() => reject(new Error("La connexion Microsoft a expiré. Réessayez.")), AUTHORIZATION_TIMEOUT_MS);
        const settle = (value) => { clearTimeout(watchdog); clearTimeout(grace); resolve(value); };
        Promise.all([
          this.#app.addListener("appUrlOpen", (event) => {
            if (typeof event?.url === "string" && event.url.startsWith(this.#redirectUri)) settle(event.url);
          }),
          this.#browser.addListener("browserFinished", () => {
            grace = setTimeout(() => settle(null), BROWSER_CLOSED_GRACE_MS);
          })
        ]).then((handles) => {
          listeners.push(...handles);
          return this.#browser.open({ url });
        }).catch((error) => { clearTimeout(watchdog); reject(error); });
      });
    } finally {
      await Promise.all(listeners.map((handle) => handle?.remove?.()));
      await this.#browser.close().catch(() => {});
    }
  }

  async connect() {
    if (this.#pending) throw new Error("Une connexion Microsoft est déjà en cours.");
    this.#pending = true;
    try {
      const { verifier, challenge } = await createPkcePair(this.#crypto);
      const state = randomState(this.#crypto);
      const url = new URL(`${AUTHORITY}/authorize`);
      url.search = new URLSearchParams({
        client_id: this.#clientId,
        response_type: "code",
        redirect_uri: this.#redirectUri,
        scope: SCOPE,
        state,
        prompt: "select_account",
        code_challenge: challenge,
        code_challenge_method: "S256"
      }).toString();

      const callbackUrl = await this.#waitForRedirect(url.href);
      if (!callbackUrl) throw new Error("Connexion annulée.");
      const params = new URL(callbackUrl).searchParams;
      if (params.get("error")) throw new Error(params.get("error_description") || params.get("error"));
      if (params.get("state") !== state) throw new Error("Réponse Microsoft inattendue : connexion ignorée.");
      const code = params.get("code");
      if (!code) throw new Error("Microsoft n'a renvoyé aucun code d'autorisation.");

      const body = await this.#requestToken({
        grant_type: "authorization_code", code, redirect_uri: this.#redirectUri, code_verifier: verifier
      });
      const accountId = readSubject(body.id_token || "");
      if (!accountId) throw new Error("Compte Microsoft non identifié.");
      this.#session = this.#toSession(body, accountId);
    } finally {
      this.#pending = false;
    }
  }

  #toSession(body, accountId) {
    return {
      accountId,
      accessToken: body.access_token,
      refreshToken: body.refresh_token || this.#session?.refreshToken || null,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000
    };
  }

  async getToken() {
    const session = this.#session;
    if (!session) throw new Error("Connectez d'abord OneDrive.");
    if (session.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return session.accessToken;
    try {
      if (!session.refreshToken) throw new Error("jeton de renouvellement absent");
      const body = await this.#requestToken({ grant_type: "refresh_token", refresh_token: session.refreshToken });
      if (this.#session === session) this.#session = this.#toSession(body, session.accountId);
      return body.access_token;
    } catch (error) {
      throw new Error("Session Microsoft expirée ou indisponible : reconnectez OneDrive.", { cause: error });
    }
  }

  async disconnect() {
    if (!this.#session) throw new Error("Aucune session OneDrive active.");
    this.#session = null;
  }
}
