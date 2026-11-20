import assert from "node:assert/strict";
import test from "node:test";
import { OneDriveNativeAuth } from "../onedrive-native-auth.js";

const REDIRECT = "msauth://fr.familiia.app/hash%3D";
const idToken = `x.${Buffer.from(JSON.stringify({ sub: "user-1" })).toString("base64url")}.y`;

function setup(tokens) {
  const handlers = {};
  const requests = [];
  const add = async (e, fn) => { handlers[e] = fn; return { remove: async () => {} }; };
  const browser = {
    addListener: add,
    close: async () => {},
    open: async ({ url }) => {
      const state = new URL(url).searchParams.get("state");
      setTimeout(() => handlers.appUrlOpen({ url: `${REDIRECT}?code=c1&state=${state}` }), 0);
    }
  };
  const fetchImpl = async (url, init) => {
    requests.push(new URLSearchParams(init.body));
    return { ok: true, status: 200, json: async () => tokens.shift() };
  };
  return { auth: new OneDriveNativeAuth({ clientId: "cid", redirectUri: REDIRECT, browser, app: { addListener: add }, fetchImpl }), requests };
}

test("connexion PKCE puis renouvellement du jeton expiré", async () => {
  const { auth, requests } = setup([
    { access_token: "a1", refresh_token: "r1", id_token: idToken, expires_in: -1 },
    { access_token: "a2", expires_in: 3600 }
  ]);
  await auth.connect();
  assert.equal(auth.connected, true);
  assert.equal(auth.accountId, "user-1");
  assert.ok(requests[0].get("code_verifier"));
  assert.equal(await auth.getToken(), "a2");
  assert.equal(requests[1].get("refresh_token"), "r1");
  await auth.disconnect();
  assert.equal(auth.connected, false);
});
