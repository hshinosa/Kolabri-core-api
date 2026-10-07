/**
 * Escape a user-supplied string so it is matched literally when embedded in a
 * RegExp (or a MongoDB `$regex` pattern).
 *
 * Without this, metacharacters coming from request input (`.*`, `[a-`, ...)
 * stay live: they let an attacker match arbitrary content, compile invalid
 * patterns (HTTP 500 in Mongo) or ship ReDoS-heavy backtracking expressions.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
