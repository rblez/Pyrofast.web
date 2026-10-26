// Límite simple en memoria por instancia: 30 peticiones por minuto e IP.
const hits = new Map<string, number[]>();
export function checkRateLimit(k: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(k, arr);
    return false;
  }
  arr.push(now);
  hits.set(k, arr);
  return true;
}
