/**
 * Shared SWR fetcher for PostgreSQL-backed /api routes.
 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
