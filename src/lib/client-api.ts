export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok)
    throw new ApiError(data.error ?? "ทำรายการไม่สำเร็จ", res.status);
  return data as T;
}
