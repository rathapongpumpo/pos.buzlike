const CACHE = "buzlike-pos-shell-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name === "buzlike-pos-shell-v1") await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_POS") {
    const url = new URL(event.data.url, self.location.origin);
    if (
      url.origin === self.location.origin &&
      url.searchParams.has("branchId") &&
      url.searchParams.has("scope") &&
      /^\/[^/]+\/pos$/.test(url.pathname)
    )
      event.waitUntil(
        caches.open(CACHE).then(async (cache) => {
          const response = await fetch(url);
          if (response.ok && !response.redirected)
            await cache.put(url, response);
        }),
      );
  }
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET")
    return;
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/cafe-menu-sprite.png"
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }
  if (
    event.request.mode === "navigate" &&
    /^\/[^/]+\/pos$/.test(url.pathname)
  ) {
    const scoped = Boolean(url.searchParams.get("branchId") && url.searchParams.get("scope"));
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (scoped && response.ok && !response.redirected) {
            const cache = await caches.open(CACHE);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = scoped ? await caches.match(event.request) : undefined;
          return (
            cached ||
            new Response("กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อเปิดร้านครั้งแรก", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
  }
});
