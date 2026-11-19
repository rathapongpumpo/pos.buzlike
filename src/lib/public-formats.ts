export const contentSignal = "search=yes, ai-input=yes, ai-train=no";
export function markdownPath(path: string) {
  return path === "/" ? "/index.md" : `${path}.md`;
}

// Explicit Markdown only. Wildcards and equal preferences keep the normal HTML UI.
export function prefersMarkdown(accept: string | null) {
  if (!accept) return false;
  const ranges = accept.split(",").map((range) => {
    const [rawType, ...parameters] = range.trim().toLowerCase().split(";");
    const q = parameters
      .map((p) => p.trim())
      .find((p) => p.startsWith("q="))
      ?.slice(2);
    return {
      type: rawType.trim(),
      q:
        q === undefined
          ? 1
          : /^(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q)
            ? Number(q)
            : 0,
    };
  });
  function quality(type: string) {
    for (const match of [type, "text/*", "*/*"]) {
      const found = ranges.filter((r) => r.type === match);
      if (found.length) return Math.max(...found.map((r) => r.q));
    }
    return 0;
  }
  return (
    ranges.some((r) => r.type === "text/markdown" && r.q > 0) &&
    quality("text/markdown") > quality("text/html")
  );
}

export function mergeVary(headers: Headers, value: string) {
  const existing = (headers.get("Vary") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !existing.some((s) => s.toLowerCase() === value.toLowerCase() || s === "*")
  )
    existing.push(value);
  headers.set("Vary", existing.join(", "));
}
