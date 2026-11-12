import type { Bootstrap } from "./view-types";
// Client-side convenience guard. The server remains authoritative for offline replay.
export function saleAccessBlocked(
  data: Pick<Bootstrap, "state" | "entitlement">,
  now = Date.now(),
) {
  if (["READ_ONLY", "SUSPENDED"].includes(data.state)) return true;
  if (data.entitlement?.source !== "PILOT") return false;
  const end = data.entitlement.endsAt
    ? +new Date(data.entitlement.endsAt)
    : NaN;
  return (
    data.entitlement.state !== "ACTIVE" || !Number.isFinite(end) || now >= end
  );
}
