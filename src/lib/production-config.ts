export function productionConfigIssues(env: NodeJS.ProcessEnv) {
  const issues: string[] = [];
  for (const key of ["AUTH_SECRET", "OPERATIONS_TOKEN"])
    if (
      !env[key] ||
      env[key]!.length < 32 ||
      /CHANGE|GENERATE|EXAMPLE/i.test(env[key]!)
    )
      issues.push(`${key}_REQUIRED`);
  let origin = "";
  try {
    const url = new URL(env.AUTH_URL!);
    if (
      url.protocol !== "https:" ||
      ["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.hostname.endsWith(".invalid") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error();
    origin = url.origin;
  } catch {
    issues.push("AUTH_URL_HTTPS_ORIGIN_REQUIRED");
  }
  if (!origin || env.NEXT_PUBLIC_APP_URL !== origin)
    issues.push("PUBLIC_ORIGIN_MISMATCH");
  try {
    const url = new URL(env.DATABASE_URL!);
    if (!url.password || /CHANGE|EXAMPLE/i.test(url.password)) throw Error();
  } catch {
    issues.push("DATABASE_URL_REQUIRED");
  }
  if (env.SEED_DEMO !== "false") issues.push("DEMO_SEED_MUST_BE_FALSE");
  if (env.RESTORE_DRILL === "true") issues.push("RESTORE_DRILL_CANNOT_GO_LIVE");
  if (env.OUTBOUND_EMAIL_ENABLED !== "true")
    issues.push("EMAIL_DELIVERY_NOT_ENABLED");
  for (const key of ["SMTP_HOST", "SMTP_FROM"])
    if (!env[key]) issues.push(`${key}_REQUIRED`);
  if (!env.SMTP_USER || !env.SMTP_PASS) issues.push("SMTP_AUTH_REQUIRED");
  if (!["465", "587"].includes(env.SMTP_PORT ?? ""))
    issues.push("SMTP_TLS_PORT_REQUIRED");
  if (env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET)
    issues.push("PILOT_STRIPE_MUST_BE_UNSET");
  if (env.LEGAL_CONTACT_APPROVED !== "true")
    issues.push("PRIVACY_CONTACT_REVIEW_REQUIRED");
  if (!!env.AUTH_GOOGLE_ID !== !!env.AUTH_GOOGLE_SECRET)
    issues.push("GOOGLE_CONFIG_INCOMPLETE");
  return issues;
}
