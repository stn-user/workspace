export async function gateLocalQwenResponse(page) {
  const origin = new URL(page.url()).origin;
  let markRequestStarted;
  const requestStarted = new Promise(resolve => {
    markRequestStarted = resolve;
  });
  let releaseResponse;
  const responseGate = new Promise(resolve => {
    releaseResponse = resolve;
  });
  let markResponseFinished;
  const responseFinished = new Promise(resolve => {
    markResponseFinished = resolve;
  });

  await page.route("http://127.0.0.1:11434/**", async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
      return;
    }

    markRequestStarted();
    await responseGate;
    try {
      if (!request.failure()) {
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": origin, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: JSON.stringify({
                status: "answered",
                answer: "Montant total : 321 euros TTC",
                claims: [{
                  text: "Montant total : 321 euros TTC",
                  citations: [{ evidenceId: "evidence-1", quote: "Montant total : 321 euros TTC" }]
                }]
              })
            }
          })
        });
      }
    } finally {
      markResponseFinished();
    }
  });

  return {
    requestStarted,
    release: async () => {
      releaseResponse();
      await responseFinished;
    }
  };
}
