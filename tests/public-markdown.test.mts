import { test } from "node:test";
import assert from "node:assert/strict";
import { prefersMarkdown } from "../src/lib/public-formats";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3102";
const request = (
  path: string,
  accept = "text/html",
  method = "GET",
  headers: Record<string, string> = {},
) =>
  fetch(base + path, {
    method,
    redirect: "manual",
    headers: { Accept: accept, ...headers },
    signal: AbortSignal.timeout(20000),
  });
const pages = ["/", "/pricing", "/about", "/support", "/privacy", "/terms"];
const variesByAccept = (r: Response) =>
  (r.headers.get("vary") ?? "")
    .toLowerCase()
    .split(",")
    .map((v) => v.trim())
    .includes("accept");

test("Accept negotiation respects explicit exclusions, specificity and HTML ties", () => {
  for (const [header, expected] of [
    [null, false],
    ["*/*", false],
    ["text/*", false],
    ["text/markdown", true],
    ["TEXT/MARKDOWN", true],
    ["text/html, text/markdown", false],
    ["text/markdown, */*", false],
    ["text/html;q=0.8,text/markdown;q=0.9", true],
    ["text/html;q=0.9,text/markdown;q=0.8", false],
    ["text/markdown;q=0, */*;q=1", false],
    ["text/markdown;q=0.8,text/*;q=1", false],
    ["text/markdown;q=1,text/*;q=0", true],
    ["text/html;q=0, */*;q=0.1, text/markdown;q=0.8", true],
    ["text/markdown;q=2,text/html", false],
    ["text/markdown;q=abc", false],
  ] as const)
    assert.equal(prefersMarkdown(header), expected, String(header));
});

test("robots publishes usage signals and llms.txt is a text index linking only public Markdown", async () => {
  const robots = await (await request("/robots.txt")).text();
  assert.match(
    robots,
    /User-Agent: \*\nContent-Signal: search=yes, ai-input=yes, ai-train=no/,
  );
  assert(robots.includes("Disallow: /"));
  assert(robots.includes("Sitemap: https://pos.buzlike.com/sitemap.xml"));
  const response = await request("/llms.txt");
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type")!,
    /^text\/plain; charset=utf-8/i,
  );
  const text = await response.text();
  assert.match(text, /^# BUZLIKE POS\n\n> /);
  const links = [
    ...text.matchAll(/\]\((https:\/\/pos\.buzlike\.com[^)]+\.md)\)/g),
  ].map((m) => new URL(m[1]).pathname);
  assert.deepEqual(
    links.sort(),
    [
      "/index.md",
      "/pricing.md",
      "/about.md",
      "/support.md",
      "/privacy.md",
      "/terms.md",
    ].sort(),
  );
  for (const link of links) assert(robots.includes(`Allow: ${link}$`));
});

test("All public pages negotiate Markdown and expose identical explicit .md representations", async () => {
  for (const path of pages) {
    const response = await request(path, "text/markdown");
    assert.equal(response.status, 200, path);
    assert.match(
      response.headers.get("content-type")!,
      /^text\/markdown; charset=utf-8/i,
    );
    assert(variesByAccept(response), "Vary includes the exact Accept field");
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(
      response.headers.get("set-cookie"),
      null,
      "Public Markdown does not create a session",
    );
    assert.match(response.headers.get("link")!, /rel="canonical"/);
    const markdown = await response.text();
    assert.match(markdown, /^# /);
    assert(!/<(?:html|script|body)[\s>]/i.test(markdown));
    const explicit = await request(path === "/" ? "/index.md" : `${path}.md`);
    assert.equal(explicit.status, 200);
    assert.equal(await explicit.text(), markdown);
  }
});

test("HTML and Markdown alternate safely under repeated requests, cookies and quality weights", async () => {
  for (const path of ["/", "/pricing", "/privacy"]) {
    for (const accept of [
      "text/markdown",
      "text/html",
      "text/markdown;q=0, */*;q=1",
      "text/html;q=0.1, text/markdown;q=1",
      "text/html",
    ]) {
      const response = await request(path, accept, "GET", {
        Cookie: "authjs.session-token=invalid-public-audit-cookie",
        "X-Audit-Marker": "MUST_NOT_APPEAR_IN_PUBLIC_CONTENT",
      });
      assert.equal(response.status, 200);
      const markdown = prefersMarkdown(accept);
      assert.match(
        response.headers.get("content-type")!,
        markdown ? /^text\/markdown/ : /^text\/html/,
      );
      assert(variesByAccept(response), "Vary includes the exact Accept field");
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const body = await response.text();
      assert(
        !body.includes("MUST_NOT_APPEAR_IN_PUBLIC_CONTENT") &&
          !body.includes("invalid-public-audit-cookie"),
      );
      if (!markdown)
        assert.match(
          body,
          /rel="alternate"[^>]*type="text\/markdown"|type="text\/markdown"[^>]*rel="alternate"/,
        );
    }
  }
});

test("Markdown prices use actual public plan prices and legal terms share the HTML source", async () => {
  const html = await (await request("/pricing")).text();
  const markdown = await (await request("/pricing", "text/markdown")).text();
  const prices = [
    ...html.matchAll(/class="plan-price">฿(?:<!-- -->)?([\d,.]+)/g),
  ].map((m) => m[1]);
  assert(prices.length >= 2, "Rendered monthly prices found");
  for (const price of prices.slice(0, 2))
    assert(markdown.includes(`${price} บาท/เดือน`));
  if (prices.length === 3)
    assert(markdown.includes(`${prices[2]} บาท จ่ายครั้งเดียว`));
  if (html.includes("ยังไม่เปิดรับชำระเงิน"))
    assert(markdown.includes("ยังไม่เปิดรับชำระเงิน"));
  const privacy = await (await request("/privacy", "text/markdown")).text();
  assert(privacy.includes("รายละเอียดผู้ให้บริการ"));
  assert(privacy.includes("ต้องยืนยันก่อนเปิดรับร้านจริง"));
  const terms = await (await request("/terms", "text/markdown")).text();
  assert(terms.includes("ไม่มีการเรียกเก็บเงินอัตโนมัติ"));
  assert(terms.includes("ไม่ต่อเป็นแพ็กเกจเสียเงินให้อัตโนมัติ"));
});

test("HEAD is bodyless, Markdown is read only, and account/API/token paths are not converted", async () => {
  const head = await request("/index.md", "text/markdown", "HEAD");
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type")!, /^text\/markdown/);
  assert.equal(await head.text(), "");
  assert.equal(
    (await request("/index.md", "text/markdown", "POST")).status,
    405,
  );
  assert.equal(
    (await request("/no-such-page.md", "text/markdown")).status,
    404,
  );
  assert.equal(
    (await request("/api/admin/pilot", "text/markdown")).status,
    401,
  );
  assert.equal((await request("/superadmin", "text/markdown")).status, 307);
  for (const path of ["/login", "/register", "/invite"]) {
    const r = await request(path, "text/markdown");
    assert.doesNotMatch(r.headers.get("content-type") ?? "", /^text\/markdown/);
    assert.equal(
      r.headers.get("content-signal"),
      null,
      "Usage signal is scoped to public documents",
    );
  }
  // Real Next client navigation uses wildcard Accept; Next strips flight headers before middleware.
  const rsc = await request("/about", "*/*", "GET", { rsc: "1" });
  assert.match(rsc.headers.get("content-type")!, /^text\/x-component/);
});
