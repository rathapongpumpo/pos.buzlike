// Client-safe allowlist: never redirect to arbitrary user-supplied URLs.
export function safeNext(value?: string | null) {
  return value &&
    (["/pilot", "/pilot/waitlist"].includes(value) ||
      /^\/invite\?token=[a-f0-9]{64}$/.test(value) ||
      /^\/subscribe\?plan=(STARTER_MONTHLY|STARTER_YEARLY|PRO_MONTHLY|PRO_YEARLY|LIFETIME_BUYOUT)$/.test(
        value,
      ))
    ? value
    : "/start";
}
export function planFromNext(value?: string | null) {
  const next = safeNext(value);
  return next.startsWith("/subscribe?plan=")
    ? (next.slice(16) as
        | "STARTER_MONTHLY"
        | "STARTER_YEARLY"
        | "PRO_MONTHLY"
        | "PRO_YEARLY"
        | "LIFETIME_BUYOUT")
    : null;
}
