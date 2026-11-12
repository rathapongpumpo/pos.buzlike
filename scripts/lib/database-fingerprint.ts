import type { PrismaClient } from "@prisma/client";
export function sqlIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw Error("Invalid database identifier");
  return `"${value}"`;
}
export async function databaseFingerprint(client: PrismaClient) {
  const schemas = await client.$queryRaw<
    { table_schema: string }[]
  >`SELECT table_schema FROM information_schema.tables WHERE table_name='Tenant' ORDER BY table_schema`;
  const result: Record<
    string,
    Record<string, { rows: number; hash: string }>
  > = {};
  for (const { table_schema: schema } of schemas) {
    sqlIdentifier(schema);
    const tables = await client.$queryRaw<
      { table_name: string }[]
    >`SELECT table_name FROM information_schema.tables WHERE table_schema=${schema} AND table_type='BASE TABLE' ORDER BY table_name`;
    result[schema] = {};
    for (const { table_name: table } of tables) {
      const [row] = await client.$queryRawUnsafe<
        { rows: number; hash: string }[]
      >(
        `SELECT count(*)::int AS rows, md5(coalesce(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM ${sqlIdentifier(schema)}.${sqlIdentifier(table)} t`,
      );
      result[schema][table] = row;
    }
  }
  return result;
}
