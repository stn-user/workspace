import { CapacitorHttp } from "@capacitor/core";

/**
 * fetch minimal pour les échanges de jetons OAuth depuis l'application mobile.
 * La requête passe par la couche HTTP native, sans en-tête Origin : Microsoft rejette
 * l'échange de code (AADSTS90023) lorsqu'il vient de la WebView (origine https://localhost).
 */
export async function nativeFormPost(url, init = {}) {
  const data = Object.fromEntries(new URLSearchParams(String(init.body ?? "")));
  const response = await CapacitorHttp.post({
    url,
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(init.headers || {}) },
    data
  });
  const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data ?? {});
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => JSON.parse(body)
  };
}
