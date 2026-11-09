import { PublicClientApplication } from "@azure/msal-browser";

const scopes = ["Files.Read"];

export class OneDriveAuth {
  #client;
  #account = null;

  constructor(clientId) {
    if (typeof clientId !== "string" || !clientId.trim()) throw new TypeError("Identifiant Microsoft manquant.");
    this.#client = new PublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/consumers",
        redirectUri: new URL("microsoft-redirect.html", document.baseURI).href
      },
      cache: { cacheLocation: "memoryStorage" }
    });
  }

  async initialize() {
    await this.#client.initialize();
  }

  async connect() {
    const result = await this.#client.loginPopup({ scopes });
    if (!result.account?.homeAccountId) throw new Error("Compte Microsoft non identifié.");
    this.#account = result.account;
  }

  get connected() { return Boolean(this.#account); }
  get accountId() {
    if (!this.#account) throw new Error("Connectez d'abord OneDrive.");
    return this.#account.homeAccountId;
  }

  async getToken() {
    if (!this.#account) throw new Error("Connectez d'abord OneDrive.");
    try {
      const result = await this.#client.acquireTokenSilent({ scopes, account: this.#account });
      return result.accessToken;
    } catch (error) {
      throw new Error("Session Microsoft expirée ou indisponible : reconnectez OneDrive.", { cause: error });
    }
  }

  async disconnect() {
    if (!this.#account) throw new Error("Aucune session OneDrive active.");
    const account = this.#account;
    await this.#client.clearCache({ account });
    this.#account = null;
  }
}
