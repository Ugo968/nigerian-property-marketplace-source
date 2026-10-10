/**
 * Safe application logging.
 *
 * NEVER log:
 *   - Passwords
 *   - Auth tokens / session IDs / JWTs
 *   - Provider secret keys / webhook hashes
 *   - Full verification documents
 *   - PII beyond what's needed to identify a user (id is enough)
 *
 * Logs use structured key-value pairs so they can be ingested by Vercel /
 * Sentry / Datadog without parsing.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

/**
 * Sanitise an arbitrary value before logging. Recursively redacts
 * sensitive-looking keys.
 */
function sanitise<T>(value: T, depth = 0): T {
  if (depth > 4) return "[max depth]" as unknown as T;
  if (value === null || typeof value !== "object") return value;

  const SENSITIVE = new Set([
    "password",
    "passwordhash",
    "confirmpassword",
    "secret",
    "authorization",
    "token",
    "accesstoken",
    "refreshtoken",
    "sessionid",
    "cookiedata",
    "service_role_key",
    "servicerolekey",
    "anonkey",
    "secretkey",
    "publickey",
    "webhookhash",
    "encryptionkey",
    "stripe",
    "paystack_secret_key",
    "flutterwave_secret_key",
  ]);

  if (Array.isArray(value)) {
    return value.map((v) => sanitise(v, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (SENSITIVE.has(lower)) {
      out[k] = "[redacted]";
    } else {
      out[k] = sanitise(v, depth + 1);
    }
  }
  return out as unknown as T;
}

function emit(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
) {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[MIN_LEVEL]) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? sanitise(context) : {}),
  };

  if (level === "error") {
    console.error(JSON.stringify(line));
  } else if (level === "warn") {
    console.warn(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    emit("error", message, context),
};

/**
 * Wrap an async function and log any error before re-throwing.
 */
export async function withLogging<T>(
  op: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`${op} failed`, {
      ...context,
      error: message,
    });
    throw error;
  }
}
