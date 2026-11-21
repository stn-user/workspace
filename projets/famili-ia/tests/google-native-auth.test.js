import assert from "node:assert/strict";
import test from "node:test";
import { GoogleNativeAuth } from "../google-native-auth.js";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function setup({ result = { accessToken: "tok", grantedScopes: [SCOPE] }, error = null } = {}) {
  const calls = [];
  const authorizationPlugin = {
    authorize: async (options) => {
      calls.push({ method: "authorize", options });
      if (error) throw error;
      return result;
    }
  };
  const fetchCalls = [];
  const fetchImpl = async (url, init) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  };
  return {
    auth: new GoogleNativeAuth({ authorizationPlugin, fetchImpl }),
    calls,
    fetchCalls
  };
}

test("utilise l'autorisation Android Google en lecture seule", async () => {
  const { auth, calls } = setup();
  assert.deepEqual(await auth.authorize(SCOPE), { status: "granted", accessToken: "tok" });
  assert.deepEqual(calls, [{ method: "authorize", options: { scope: SCOPE } }]);
});

test("traite l'annulation du dialogue système sans jeton", async () => {
  const { auth } = setup({ result: { cancelled: true } });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "cancelled" });
});

test("accepte le jeton Android même si la liste des scopes est absente", async () => {
  const { auth } = setup({ result: { accessToken: "tok" } });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "granted", accessToken: "tok" });
});

test("fait confiance à la portée imposée par le pont et refuse une réponse sans jeton", async () => {
  const { auth } = setup({ result: { accessToken: "tok", grantedScopes: ["openid"] } });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "granted", accessToken: "tok" });
  const { auth: missingToken } = setup({ result: { grantedScopes: [SCOPE] } });
  await assert.rejects(missingToken.authorize(SCOPE), /jeton d'accès/);
});

test("propage les erreurs explicites du pont Android", async () => {
  const { auth } = setup({ error: new Error("Google Play Services indisponible") });
  await assert.rejects(auth.authorize(SCOPE), /Google Play Services indisponible/);
});

test("révoque le jeton via l'endpoint OAuth officiel", async () => {
  const { auth, fetchCalls } = setup();
  await auth.revoke("token-value");
  assert.equal(fetchCalls[0].url, "https://oauth2.googleapis.com/revoke");
  assert.match(fetchCalls[0].init.body, /token=token-value/);
});
