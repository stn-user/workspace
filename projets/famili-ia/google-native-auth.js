import { registerPlugin } from "@capacitor/core";

const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GoogleDriveAuthorization = registerPlugin("GoogleDriveAuthorization");

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

/** Utilise l'autorisation Google native Android et conserve le jeton en mémoire. */
export class GoogleNativeAuth {
  #fetch;
  #authorization;

  constructor({ fetchImpl = (...args) => fetch(...args), authorizationPlugin = GoogleDriveAuthorization } = {}) {
    this.#fetch = fetchImpl;
    this.#authorization = authorizationPlugin;
  }

  async authorize(scope) {
    if (typeof scope !== "string" || !scope.trim()) throw new TypeError("Le périmètre Google demandé est invalide.");
    const result = await this.#authorization.authorize({ scope });
    if (result?.cancelled) return { status: "cancelled" };
    if (typeof result?.accessToken !== "string" || !result.accessToken) {
      throw new Error("Google n'a pas fourni de jeton d'accès.");
    }
    // The native bridge requests a fixed Drive scope; Android may omit grantedScopes in its result.
    return { status: "granted", accessToken: result.accessToken };
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
