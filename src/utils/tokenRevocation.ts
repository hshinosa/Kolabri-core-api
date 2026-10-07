import { getRedis } from "../config/redis.js";
import { logger } from "./logger.js";

/**
 * State revocation JWT untuk fix H5 (F2/F5) & H6 (F3/F4):
 *
 * - `auth:revoked_before:<userId>` → watermark unix-DETIK; token user dengan
 *   `iat <= watermark` dianggap mati (dipakai saat logout & reset password).
 * - `auth:refresh:<jti>` → penanda bahwa refresh token sudah dirotasi; token
 *   dengan jti ini muncul lagi = REUSE → cabut seluruh sesi user.
 *
 * Redis dipakai bila REDIS_URL diset (shared antar instance). Tanpa Redis
 * (dev/unit test) fallback in-process dengan semantik & TTL yang sama.
 */

const REVOKED_BEFORE_TTL_SECONDS = 7 * 24 * 60 * 60; // > token terpanjang (refresh 7d)
const MIN_TTL_SECONDS = 60;

interface LocalEntry {
  value: number;
  expiresAt: number; // ms
}

const localRevokedBefore = new Map<string, LocalEntry>();
const localUsedRefreshJti = new Map<string, LocalEntry>();

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function localRead(map: Map<string, LocalEntry>, key: string): number | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function localWrite(
  map: Map<string, LocalEntry>,
  key: string,
  value: number,
  ttlSeconds: number,
): void {
  const expiresAt = Date.now() + Math.max(MIN_TTL_SECONDS, ttlSeconds) * 1000;
  const current = localRead(map, key);
  if (current !== null && current >= value) return; // watermark monotonik
  map.set(key, { value, expiresAt });
}

/**
 * Set watermark "semua token user dengan iat <= atSeconds dianggap mati".
 * Monotonik: nilai tidak pernah turun (logout/reset terakhir yang menang).
 */
export async function setRevokedBefore(
  userId: string,
  atSeconds: number = nowSeconds(),
  ttlSeconds: number = REVOKED_BEFORE_TTL_SECONDS,
): Promise<void> {
  if (!userId) return;
  const key = `auth:revoked_before:${userId}`;
  const ttl = Math.max(MIN_TTL_SECONDS, ttlSeconds);

  // Selalu tulis juga ke memori supaya fallback tetap punya state terbaru.
  localWrite(localRevokedBefore, userId, atSeconds, ttl);

  const redis = getRedis();
  if (!redis) return;
  try {
    const raw = await redis.get(key);
    const current = raw === null ? null : Number.parseInt(raw, 10);
    if (current === null || !Number.isFinite(current) || atSeconds > current) {
      await redis.set(key, String(atSeconds), "EX", ttl);
    }
  } catch (error) {
    logger.warn(
      "tokenRevocation: setRevokedBefore redis failed, memory fallback",
      error as Error,
    );
  }
}

/** Ambil watermark (detik) untuk user; null bila tidak ada. */
export async function getRevokedBefore(userId: string): Promise<number | null> {
  if (!userId) return null;
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`auth:revoked_before:${userId}`);
      if (raw !== null) {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
    } catch (error) {
      logger.warn(
        "tokenRevocation: getRevokedBefore redis failed, memory fallback",
        error as Error,
      );
    }
  }
  return localRead(localRevokedBefore, userId);
}

/** true bila token dengan iat tersebut sudah mati (iat <= watermark). */
export async function isRevokedBefore(
  userId: string,
  iat: number | undefined,
): Promise<boolean> {
  if (typeof iat !== "number") return false;
  const watermark = await getRevokedBefore(userId);
  if (watermark === null) return false;
  return iat <= watermark;
}

/** Tandai refresh token (berdasar jti) sudah dirotasi — dipakai utk deteksi reuse. */
export async function markRefreshUsed(
  jti: string,
  ttlSeconds: number,
): Promise<void> {
  if (!jti) return;
  const ttl = Math.max(MIN_TTL_SECONDS, ttlSeconds);
  localWrite(localUsedRefreshJti, jti, 1, ttl);

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`auth:refresh:${jti}`, "1", "EX", ttl);
  } catch (error) {
    logger.warn(
      "tokenRevocation: markRefreshUsed redis failed, memory fallback",
      error as Error,
    );
  }
}

/** true bila jti ini pernah dirotasi (pemakaian ulang = reuse). */
export async function isRefreshUsed(jti: string): Promise<boolean> {
  if (!jti) return false;
  const redis = getRedis();
  if (redis) {
    try {
      if ((await redis.exists(`auth:refresh:${jti}`)) === 1) return true;
    } catch (error) {
      logger.warn(
        "tokenRevocation: isRefreshUsed redis failed, memory fallback",
        error as Error,
      );
    }
  }
  return localRead(localUsedRefreshJti, jti) !== null;
}

/** Bersihkan state in-process (khusus unit test). */
export function _resetTokenRevocationForTests(): void {
  localRevokedBefore.clear();
  localUsedRefreshJti.clear();
}
