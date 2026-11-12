export function offlineScope(
  userId: string,
  slug: string,
  branchId: string,
  operatorId: string,
) {
  return `${userId}:${slug}:${branchId}:${operatorId}`;
}
export function replayMatchesScope(
  key: string,
  row: {
    key: string;
    slug: string;
    input: { branchId?: string; operatorId?: string };
  },
) {
  const parts = key.split(":");
  return (
    parts.length === 4 &&
    parts.every(Boolean) &&
    row.key === key &&
    row.slug === parts[1] &&
    row.input.branchId === parts[2] &&
    row.input.operatorId === parts[3]
  );
}
