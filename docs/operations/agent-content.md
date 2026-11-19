# Public agent content

Scope: marketing information only. The six canonical public URLs are defined in `src/lib/public-site.ts`. This release does not open the pilot, checkout, email delivery, or access to tenant data.

- `/llms.txt` is a UTF-8 plain-text Markdown index with an H1, summary and links to the public Markdown documents. No account or token URLs are listed.
- `/index.md`, `/pricing.md`, `/about.md`, `/support.md`, `/privacy.md` and `/terms.md` serve `text/markdown; charset=utf-8` directly, without redirects.
- The corresponding canonical HTML URLs also return Markdown for a positive explicit `Accept: text/markdown` preference stronger than HTML. Exact exclusions take precedence over wildcard quality. Equal preferences, ordinary browser headers, and wildcard-only requests keep HTML. React Server Component requests retain their normal representation.
- HTML metadata and HTTP Link headers advertise alternate Markdown and the llms index. Markdown links back to its canonical HTML page.
- Both negotiated formats are private/no-store and vary by the exact `Accept` header, preserving framework RSC and compression dimensions. Test the deployed origin and CDN, not only the local middleware Response.
- Markdown reads no session context or user-controlled content. Public plan prices and release/checkout mode are the only database inputs. Legal/about/support text and plan cards have shared sources with HTML (`public-documents.tsx`, `public-plan-cards.ts`). Keep those sources authoritative when editing copy.
- robots declares `Content-Signal: search=yes, ai-input=yes, ai-train=no` inside the user-agent group and uses an explicit allowlist. The signal states usage preferences; it does not replace login/authorization. The response header is scoped to public service documents.

## Next.js 15.5.29 Vary compatibility

The installed `next/dist/build/templates/app-page.js` sets Vary after middleware and overwrites a custom Accept dimension. `src/instrumentation.ts` installs a small Node response-header compatibility hook: only when the response already carries this application's public Content-Signal does it merge Accept and existing Vary tokens before writing Vary. It is idempotent, does not change bodies or other headers, and leaves private routes untouched. Re-evaluate it when upgrading Next.js; remove it only after integration checks prove both HTML and Markdown retain the exact Accept dimension. Accept-Encoding alone does not satisfy that check.

## Verification

With a production-mode server running, use:

```sh
node --import tsx --test tests/public-discovery.test.mts tests/public-markdown.test.mts
```

Default test URL is `http://127.0.0.1:3102`. Set TEST_BASE_URL to the deployed origin for CDN verification. TEST_STORE_SLUG enables the read-only existing-store guest gate check; omit on an empty production database. Tests cover format negotiation, quality values, repeated mixed requests, public data parity, private/token route exclusion, missing URLs, HEAD/POST, links and metadata.

Check through the actual host after each deployment. Hosted browser checks may briefly challenge a browser independently of these representations; do not count a challenge page as the application.

References: [llms.txt v2](https://llmstxt.org/), [Content Signals](https://contentsignals.org/), [HTTP Accept](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept), [Markdown content negotiation and Vary](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/).
