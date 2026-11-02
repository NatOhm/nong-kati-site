/**
 * Safe JSON body reader — one home for the `res.json().catch(() => ({}))`
 * pattern. Same contract (unparseable body → empty object, typed as T) plus
 * a one-line warning so malformed server responses stop surfacing as
 * mystery empty states in the UI.
 */
// Accepts responses AND incoming requests (admin routes parse req.json()).
export async function safeJson<T>(
  res: Pick<Response, 'json'> & Partial<Pick<Response, 'url' | 'status'>>,
): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    console.warn('[safeJson] unparseable response body', { status: res.status, url: res.url });
    return {} as T;
  }
}
