const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const BROWSER_CLOSED_GRACE_MS = 1500;
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkcePair(cryptoImpl = globalThis.crypto) {
  const verifier = base64Url(cryptoImpl.getRandomValues(new Uint8Array(48)));
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/**
 * Autorisation Google par PKCE dans le navigateur système (Custom Tab), avec retour
 * dans l'application par un lien à schéma personnalisé. Le jeton reste en mémoire.
 */
export class GoogleNativeAuth {
  #clientId;
  #redirectUri;
  #browser;
  #app;
  #fetch;
  #crypto;
  #pending = false;

  constructor({ clientId, redirectUri, browser, app, fetchImpl = (...args) => fetch(...args), cryptoImpl = globalThis.crypto }) {
    if (!clientId || !redirectUri || !browser || !app) throw new TypeError("Configuration Google native incomplète.");
    this.#clientId = clientId;
    this.#redirectUri = redirectUri;
    this.#browser = browser;
    this.#app = app;
    this.#fetch = fetchImpl;
    this.#crypto = cryptoImpl;
  }

  async authorize(scope) {
    if (this.#pending) throw new Error("Une autorisation Google est déjà en cours.");
    this.#pending = true;
    const listeners = [];
    try {
      const { verifier, challenge } = await createPkcePair(this.#crypto);
      const state = base64Url(this.#crypto.getRandomValues(new Uint8Array(16)));
      const url = new URL(AUTH_ENDPOINT);
      url.search = new URLSearchParams({
        client_id: this.#clientId,
        redirect_uri: this.#redirectUri,
        response_type: "code",
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      }).toString();

      const callbackUrl = await new Promise((resolve, reject) => {
        let timer = null;
        const finish = (value) => { clearTimeout(timer); resolve(value); };
        const watchdog = setTimeout(() => reject(new Error("L'autorisation Google a expiré. Réessayez.")), AUTHORIZATION_TIMEOUT_MS);
        const settle = (value) => { clearTimeout(watchdog); finish(value); };
        Promise.all([
          this.#app.addListener("appUrlOpen", (event) => {
            if (typeof event?.url === "string" && event.url.startsWith(this.#redirectUri)) settle(event.url);
          }),
          this.#browser.addListener("browserFinished", () => {
            timer = setTimeout(() => settle(null), BROWSER_CLOSED_GRACE_MS);
          })
        ]).then((handles) => {
          listeners.push(...handles);
          return this.#browser.open({ url: url.href });
        }).catch((error) => { clearTimeout(watchdog); reject(error); });
      });
      await this.#browser.close().catch(() => {});
      if (!callbackUrl) return { status: "cancelled" };

      const params = new URL(callbackUrl).searchParams;
      if (params.get("error")) {
        if (params.get("error") === "access_denied") return { status: "cancelled" };
        throw new Error(`Autorisation Google refusée : ${params.get("error_description") || params.get("error")}`);
      }
      if (params.get("state") !== state) throw new Error("Réponse Google inattendue : l'autorisation a été ignorée.");
      const code = params.get("code");
      if (!code) throw new Error("Google n'a renvoyé aucun code d'autorisation.");

      const response = await this.#fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.#clientId,
          code,
          code_verifier: verifier,
          redirect_uri: this.#redirectUri,
          grant_type: "authorization_code"
        }).toString()
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.access_token) {
        throw new Error(`Google a refusé l'échange du code : ${body.error_description || body.error || response.status}`);
      }
      const grantedScopes = String(body.scope || "").split(/\s+/);
      if (!scope.split(/\s+/).every((required) => grantedScopes.includes(required))) {
        return { status: "insufficient-scope" };
      }
      return { status: "granted", accessToken: body.access_token };
    } finally {
      await Promise.all(listeners.map((handle) => handle?.remove?.()));
      this.#pending = false;
    }
  }

  async revoke(token) {
    const response = await this.#fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString()
    });
    if (!response.ok) throw new Error("Google n'a pas confirmé la révocation.");
  }
}
