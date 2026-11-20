import { createClient } from "redis";
import { createHash } from "node:crypto";
import { HttpError } from "@/lib/http";

type RedisClient = ReturnType<typeof createClient>;
type RedisGlobal = typeof globalThis & {
  nebulaRedis?: RedisClient;
  nebulaRedisConnection?: Promise<RedisClient>;
};

const globalRedis = globalThis as RedisGlobal;

export async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    throw new HttpError(503, "Redis is not configured", "REDIS_NOT_CONFIGURED");
  }
  if (globalRedis.nebulaRedis?.isReady) return globalRedis.nebulaRedis;
  if (globalRedis.nebulaRedisConnection) return globalRedis.nebulaRedisConnection;

  const client = globalRedis.nebulaRedis ?? createClient({ url: process.env.REDIS_URL });
  client.on("error", () => console.error("Redis client reported a connection error."));
  globalRedis.nebulaRedis = client;
  globalRedis.nebulaRedisConnection = client.connect()
    .then(() => client)
    .catch(() => {
      globalRedis.nebulaRedis = undefined;
      client.destroy();
      throw new HttpError(503, "Redis is temporarily unavailable", "REDIS_UNAVAILABLE");
    })
    .finally(() => {
      globalRedis.nebulaRedisConnection = undefined;
    });
  return globalRedis.nebulaRedisConnection;
}

export async function redisRateLimit(namespace: string, address: string, windowMs: number) {
  const client = await getRedisClient();
  const hash = createHash("sha256").update(`${namespace}:${address}`).digest("hex");
  const result = await client.eval(
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count",
    { keys: [`nebula:ratelimit:${hash}`], arguments: [String(windowMs)] },
  );
  if (typeof result !== "number") {
    throw new HttpError(503, "Redis rate limiting is unavailable", "RATE_LIMIT_BACKEND_ERROR");
  }
  return result;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!process.env.REDIS_URL) return null;
  try {
    const client = await getRedisClient();
    const cached = await client.get(`nebula:cache:${key}`);
    return cached ? JSON.parse(cached) as T : null;
  } catch {
    console.warn("Redis cache read failed; loading fresh data.");
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number) {
  if (!process.env.REDIS_URL) return;
  try {
    const client = await getRedisClient();
    await client.set(`nebula:cache:${key}`, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    console.warn("Redis cache write failed; live data remains available.");
  }
}
