import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("offline shell: unscoped entries are never saved/reused; cached HTML cannot cross branch or operator", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const entries = new Map<string, Response>();
  let online = true;
  const address = (request: Request | URL | string) => typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  const cache = {
    put: async (request: Request | URL | string, response: Response) => { entries.set(address(request), response.clone()); },
    match: async (request: Request | URL | string) => entries.get(address(request))?.clone(),
  };
  runInNewContext(await readFile("public/sw.js", "utf8"), {
    URL, Response,
    self: { location: { origin: "http://localhost:3100" }, addEventListener: (type: string, callback: (event: unknown) => void) => { listeners[type] = callback; } },
    caches: { open: async () => cache, match: cache.match },
    fetch: async (request: { url: string }) => { if (!online) throw new Error("Offline"); return new Response(`HTML:${request.url}`); },
  });
  const navigate = (url: string) => {
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url, method: "GET", mode: "navigate" }, respondWith: (value: Promise<Response>) => { response = value; } });
    assert.ok(response);
    return response;
  };
  const plain = "http://localhost:3100/shop/pos";
  const scoped = `${plain}?branchId=A&scope=owner:cashier`;
  await navigate(plain);
  assert.equal(entries.has(plain), false);
  await navigate(scoped);
  assert.equal(entries.has(scoped), true);
  // A pre-upgrade entry must not become an offline fallback.
  entries.set(plain, new Response("OLD OWNER HTML"));
  online = false;
  assert.equal((await navigate(plain)).status, 503);
  assert.equal((await navigate(`${plain}?branchId=B&scope=owner:cashier`)).status, 503);
  assert.equal((await navigate(`${plain}?branchId=A&scope=owner:other`)).status, 503);
  assert.equal(await (await navigate(scoped)).text(), `HTML:${scoped}`);
});
