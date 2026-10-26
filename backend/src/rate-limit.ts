/**
 * Rate limiting en memoria para POST /chat.
 *
 * Diseño: ventana fija por IP. Se eligió ventana fija (y no token bucket)
 * porque es el mecanismo más simple de razonar y de probar, no necesita
 * timers en segundo plano y basta para el abuso que importa aquí: ráfagas
 * automatizadas contra un endpoint que dispara un loop de agente LLM
 * (caro en tokens y en tiempo por request).
 *
 * Límite por defecto: 30 req/min por IP.
 * Justificación: un humano chateando con el agente envía como mucho un
 * mensaje cada pocos segundos (una conversación intensa ronda 10-20
 * mensajes/minuto, y cada respuesta del agente tarda segundos en llegar,
 * así que el uso normal no llega a 30/min). Un bot, en cambio, dispara
 * cientos por minuto. 30 deja margen al uso normal y corta el abuso
 * antes de que queme llaves BYOK o CPU. Si el uso real lo pide, se
 * ajusta con un solo número en `chatRateLimiter` o pasando opciones a
 * `createRateLimiter`.
 *
 * Alcance: solo /chat. /health, /providers, /projects y /preview son
 * lecturas baratas y no se limitan aquí. /api/auth/* tiene su propio
 * frente (Better Auth) y no se toca.
 *
 * Nota: /chat hoy no exige sesión, así que la IP es la única clave
 * estable disponible. Cuando /chat exija sesión, conviene limitar por
 * usuario además de por IP (un NAT compartido — p. ej. una red cubana
 * con pocos IPs salientes — puede agrupar a muchos usuarios tras una
 * misma IP; el límite actual es generoso justo por eso).
 *
 * Memoria acotada: las entradas vencidas se podan en cada chequeo y,
 * si el mapa crece demasiado (ataque con IPs aleatorias), se poda
 * agresivamente antes de insertar. Sin timers ni dependencias.
 */

export interface RateLimitOptions {
  /** Requests permitidos por ventana. Por defecto 30. */
  limit?: number;
  /** Duración de la ventana en ms. Por defecto 60_000 (1 minuto). */
  windowMs?: number;
  /** Máximo de claves retenidas antes de podar. Por defecto 10_000. */
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests restantes en la ventana actual (0 si está bloqueado). */
  remaining: number;
  /** Segundos hasta que se abre la ventana siguiente (0 si allowed). */
  retryAfterSeconds: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const limit = options.limit ?? 30;
  const windowMs = options.windowMs ?? 60_000;
  const maxKeys = options.maxKeys ?? 10_000;
  const buckets = new Map<string, Entry>();

  function prune(now: number): void {
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(key);
    }
  }

  function check(key: string, now = Date.now()): RateLimitResult {
    const entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      // Ventana nueva (o primera vez): podar vencidas y, si el mapa
      // sigue saturado, no guardar la nueva entrada pero permitir el
      // request (fail-open ante un ataque de IPs aleatorias: mejor
      // servir que tumbar el endpoint por memoria).
      prune(now);
      if (buckets.size >= maxKeys) {
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, remaining: limit - entry.count, retryAfterSeconds: 0 };
  }

  return {
    check,
    /** Solo para tests / diagnóstico: cuántas IPs con ventana activa hay. */
    size: () => buckets.size,
    reset: () => buckets.clear(),
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Instancia compartida que usará el handler de /chat. */
export const chatRateLimiter = createRateLimiter();

/** IP del cliente: X-Forwarded-For (primer salto, tras proxy de confianza)
 * o la IP del socket. "unknown" si no hay ninguna (no debe tumbar nada). */
export function getClientIp(req: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const fromHeader = first?.split(",")[0]?.trim();
  if (fromHeader) return fromHeader;
  return req.socket?.remoteAddress ?? "unknown";
}

export interface RateLimitResponse {
  setHeader: (name: string, value: string) => void;
  writeHead: (status: number) => void;
  end: (body: string) => void;
}

/**
 * Guarda para el handler de /chat. Devuelve true si el request puede
 * seguir; si devuelve false ya respondió 429 con Retry-After y el
 * handler debe retornar sin procesar el body ni llamar al agente.
 * Acepta un limiter inyectable para tests; por defecto el singleton.
 */
export function applyChatRateLimit(
  req: {
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  },
  res: RateLimitResponse,
  limiter: RateLimiter = chatRateLimiter,
): boolean {
  const result = limiter.check(getClientIp(req));
  if (result.allowed) return true;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.writeHead(429);
  res.end(
    JSON.stringify({
      error: `demasiadas peticiones, intenta de nuevo en ${result.retryAfterSeconds}s`,
      retryAfterSeconds: result.retryAfterSeconds,
    }),
  );
  return false;
}
