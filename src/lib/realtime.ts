import { createClient } from "redis";
// PostgreSQL revision checks are the fallback when Redis is not configured.
// A notification failure must never fail a committed sale.
export async function publish(tenantId: string, type = "refresh") {
  if (process.env.REDIS_URL) {
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    client.on("error", () => {});
    try {
      await client.connect();
      await client.publish(`tenant:${tenantId}`, type);
    } catch {
    } finally {
      if (client.isOpen) client.destroy();
    }
  }
}
export async function subscribe(tenantId: string, onEvent: () => void) {
  if (!process.env.REDIS_URL) return () => {};
  const client = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 1000, reconnectStrategy: false },
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.subscribe(`tenant:${tenantId}`, onEvent);
  } catch {
    if (client.isOpen) client.destroy();
  }
  return () => {
    if (client.isOpen) client.destroy();
  };
}
