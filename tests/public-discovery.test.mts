import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3102";
const request = (path: string) => fetch(base + path, { redirect: "manual" });
const paths = ["/", "/pricing", "/about", "/support", "/privacy", "/terms"];

test("Public pages have their own canonical, indexable metadata and readable content", async () => {
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const canonical = html.match(/rel="canonical" href="([^"]+)"/);
    assert(canonical, `Canonical ${path}`);
    assert.equal(
      new URL(canonical[1]).href,
      new URL(path, "https://pos.buzlike.com").href,
    );
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /name="description" content="[^"]+"/);
    assert.match(html, /name="robots" content="index, follow"/);
    assert(
      !html.includes('name="robots" content="noindex'),
      `Indexable ${path}`,
    );
  }
});

test("Robots and sitemap are files with explicit public scope, without login redirects", async () => {
  const robots = await request("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type")!, /text\/plain/);
  const text = await robots.text();
  assert(text.includes("Disallow: /"));
  assert(text.includes("Sitemap: https://pos.buzlike.com/sitemap.xml"));
  for (const path of paths) assert(text.includes(`Allow: ${path}$`));
  const sitemap = await request("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type")!, /xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset/);
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(
    urls.sort(),
    paths.map((p) => `https://pos.buzlike.com${p}`).sort(),
  );
});

test("Missing routes return HTTP 404 for page, file and nested URL shapes", async () => {
  for (const path of [
    "/no-such-page-20261119",
    "/no-such-page-20261119/start",
    "/no-such-page-20261119/not-a-screen",
    "/no-such-page-20261119/a/b",
    "/absent-file.xml",
    "/absent-file.txt",
    "/.well-known/mcp/server-card.json",
    "/missing-page",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("location"), null, path);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    assert.match(await response.text(), /404/);
  }
});

test("Organization, website and software schema use consistent identities and real support", async () => {
  const html = await (await request("/")).text();
  const raw = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  );
  assert(raw);
  const graph = JSON.parse(raw[1])["@graph"];
  const org = graph.find((n: any) => n["@type"] === "Organization");
  const website = graph.find((n: any) => n["@type"] === "WebSite");
  const software = graph.find((n: any) => n["@type"] === "SoftwareApplication");
  assert.equal(org.email, "support@buzlike.com");
  assert.equal(website.publisher["@id"], org["@id"]);
  assert.equal(software.provider["@id"], org["@id"]);
  assert(!org.sameAs, "Unverified profiles omitted");
  assert(
    !software.offers && !software.aggregateRating,
    "No invented commercial offers or ratings",
  );
  assert(html.includes('href="mailto:support@buzlike.com"'));
  assert(html.includes('href="/about"'));
});

test("Account and admin routes retain guest authentication and noindex", async () => {
  for (const path of [
    "/start",
    "/onboarding",
    "/superadmin",
    "/superadmin/pilot",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.equal(
      new URL(response.headers.get("location")!, base).pathname,
      "/login",
    );
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  }
  const login = await (await request("/login")).text();
  assert.match(login, /name="robots" content="noindex, nofollow"/);
  assert.equal((await request("/api/admin/pilot")).status, 401);
  assert.equal((await request("/api/ops")).status, 401);
});

test(
  "An existing store retains its login gate",
  { skip: !process.env.TEST_STORE_SLUG },
  async () => {
    const slug = process.env.TEST_STORE_SLUG!;
    for (const path of [`/${slug}`, `/${slug}/start`, `/${slug}/pos`]) {
      const response = await request(path);
      assert.equal(response.status, 307, path);
      assert.equal(
        new URL(response.headers.get("location")!, base).pathname,
        "/login",
      );
    }
  },
);
