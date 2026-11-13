import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function contract(file: string) {
  const text = readFileSync(file, "utf8"),
    models = new Map<string, string[]>();
  for (const m of text.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    models.set(
      m[1],
      m[2]
        .split("\n")
        .map((line) => /^\s*(\w+)\s+([\w?\[\]]+)/.exec(line))
        .filter((line): line is RegExpExecArray => !!line)
        .map((line) => `${line[1]}:${line[2]}`)
        .sort(),
    );
  }
  return models;
}
test("database providers expose the same application fields and relations", () => {
  const pg = contract("prisma/schema.prisma"),
    mysql = contract("prisma/mysql/schema.prisma");
  mysql.delete("DatabaseMutex");
  assert.deepEqual([...mysql.keys()].sort(), [...pg.keys()].sort());
  for (const [model, fields] of pg)
    assert.deepEqual(mysql.get(model), fields, `Model differs: ${model}`);
});
