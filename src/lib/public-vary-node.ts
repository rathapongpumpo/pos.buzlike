import { ServerResponse } from "node:http";
import { contentSignal } from "./public-formats";

// Next 15.5.29 app-page handlers overwrite Vary after middleware (build/templates/app-page).
// Preserve the public representation dimension only on responses explicitly tagged by our middleware.
export function preservePublicVary() {
  const prototype = ServerResponse.prototype;
  const marker = Symbol.for("buzlike.public-vary");
  const flags = prototype as unknown as Record<symbol, boolean>;
  if (flags[marker]) return;
  const original = prototype.setHeader;
  prototype.setHeader = function (name, value) {
    if (
      name.toLowerCase() === "vary" &&
      this.getHeader("Content-Signal") === contentSignal
    ) {
      const values = [this.getHeader("Vary"), value, "Accept"]
        .flat()
        .filter((v) => v != null)
        .join(",")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const distinct = [
        ...new Map(values.map((v) => [v.toLowerCase(), v])).values(),
      ];
      value = distinct.includes("*") ? "*" : distinct.join(", ");
    }
    return original.call(this, name, value);
  };
  flags[marker] = true;
}
