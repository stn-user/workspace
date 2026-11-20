import assert from "node:assert/strict";
import test from "node:test";
import { GoogleNativeAuth } from "../google-native-auth.js";

const REDIRECT = "fr.familiia.app:/oauth2redirect";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function setup({ callback, tokenBody = { access_token: "tok", scope: SCOPE }, tokenOk = true }) {
  const handlers = {};
  const requests = [];
  const listener = (name) => (event, fn) => { handlers[event] = fn; return { remove: async () => {} }; };
  const app = { addListener: async (e, fn) => listener("app")(e, fn) };
  const browser = {
    addListener: async (e, fn) => listener("browser")(e, fn),
    close: async () => {},
    open: async ({ url }) => {
      requests.push({ opened: new URL(url) });
      const state = new URL(url).searchParams.get("state");
      setTimeout(() => callback({ handlers, state }), 0);
    }
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: new URLSearchParams(init.body) });
    return { ok: tokenOk, status: tokenOk ? 200 : 400, json: async () => tokenBody };
  };
  return { auth: new GoogleNativeAuth({ clientId: "cid", redirectUri: REDIRECT, browser, app, fetchImpl }), requests };
}

test("échange le code PKCE contre un jeton sans secret client", async () => {
  const { auth, requests } = setup({
    callback: ({ handlers, state }) => handlers.appUrlOpen({ url: `${REDIRECT}?code=abc&state=${state}` })
  });
  const result = await auth.authorize(SCOPE);
  assert.deepEqual(result, { status: "granted", accessToken: "tok" });
  const opened = requests[0].opened.searchParams;
  assert.equal(opened.get("code_challenge_method"), "S256");
  const exchange = requests[1].body;
  assert.equal(exchange.get("code"), "abc");
  assert.ok(exchange.get("code_verifier"));
  assert.equal(exchange.has("client_secret"), false);
});

test("refuse une réponse dont le state ne correspond pas", async () => {
  const { auth } = setup({ callback: ({ handlers }) => handlers.appUrlOpen({ url: `${REDIRECT}?code=abc&state=autre` }) });
  await assert.rejects(auth.authorize(SCOPE), /inattendue/);
});

test("access_denied est traité comme une annulation", async () => {
  const { auth } = setup({ callback: ({ handlers }) => handlers.appUrlOpen({ url: `${REDIRECT}?error=access_denied` }) });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "cancelled" });
});

test("la fermeture du navigateur sans retour annule", async () => {
  const { auth } = setup({ callback: ({ handlers }) => handlers.browserFinished() });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "cancelled" });
});

test("signale un périmètre accordé insuffisant", async () => {
  const { auth } = setup({
    tokenBody: { access_token: "tok", scope: "openid" },
    callback: ({ handlers, state }) => handlers.appUrlOpen({ url: `${REDIRECT}?code=abc&state=${state}` })
  });
  assert.deepEqual(await auth.authorize(SCOPE), { status: "insufficient-scope" });
});
