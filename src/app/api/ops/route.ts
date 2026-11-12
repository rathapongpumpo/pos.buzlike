import { operationalStatus, operationsAuthorized } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!operationsAuthorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await operationalStatus();
    return Response.json(result, { status: result.ok ? 200 : 503, headers });
  } catch {
    return Response.json(
      { ok: false, alerts: ["DATABASE_UNAVAILABLE"] },
      { status: 503, headers },
    );
  }
}
