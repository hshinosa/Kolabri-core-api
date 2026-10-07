import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for admin-supplied base URLs (fix H2).
 *
 * Two layers:
 *  1. `getBlockedUrlReason` — synchronous checks on the parsed URL: scheme,
 *     literal IP ranges (loopback / RFC1918 / link-local / CGNAT / multicast),
 *     internal hostnames (`localhost`, `*.local`, `*.internal`, single-label).
 *     WHATWG URL parsing also normalizes obfuscated IPv4 spellings such as
 *     `http://2130706433/` and `http://0x7f.1/` to `127.0.0.1`.
 *  2. `checkBaseUrlSafety` — additionally resolves the hostname (DNS) and
 *     rejects it when ANY record points at a blocked range, which is what
 *     stops DNS-rebinding style hosts that are public at validation time and
 *     private at fetch time.
 *
 * DNS failures are rejected (fail-closed): a host that does not resolve can
 * never be a legitimate provider endpoint anyway.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".intranet",
  ".corp",
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
]);

function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  // URL keeps IPv6 literals bracketed: "[::1]"
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".");
  if (octets.length !== 4) {
    return true; // not a well-formed IPv4 — reject rather than guess
  }
  const [a, b] = octets.map((part) => Number(part));
  if ([a, b].some((n) => Number.isNaN(n))) {
    return true;
  }
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 224 // multicast / reserved / broadcast
  );
}

/**
 * Expand an IPv6 address to its 8 hextets (handles `::`, zone ids and a
 * trailing dotted IPv4 such as `::ffff:127.0.0.1`). Returns null when the
 * address cannot be parsed so callers can fail closed.
 */
function expandIpv6Groups(address: string): string[] | null {
  let ip = address.toLowerCase().split("%")[0];

  // Normalize a trailing dotted quad into two hextets.
  if (ip.includes(".")) {
    const separator = ip.lastIndexOf(":");
    const v4 = ip.slice(separator + 1);
    if (separator === -1 || isIP(v4) !== 4) {
      return null;
    }
    const [o1, o2, o3, o4] = v4.split(".").map((part) => Number(part));
    const high = ((o1 << 8) | o2).toString(16);
    const low = ((o3 << 8) | o4).toString(16);
    ip = `${ip.slice(0, separator + 1)}${high}:${low}`;
  }

  const doubleColon = ip.indexOf("::");
  if (doubleColon !== -1 && ip.indexOf("::", doubleColon + 1) !== -1) {
    return null; // more than one `::`
  }

  const head = doubleColon !== -1 ? ip.slice(0, doubleColon) : ip;
  const tail = doubleColon !== -1 ? ip.slice(doubleColon + 2) : "";
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;

  const groups =
    doubleColon !== -1
      ? [...headGroups, ...Array.from({ length: missing }, () => "0"), ...tailGroups]
      : headGroups;

  if (missing < 0 || groups.length !== 8) {
    return null;
  }
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups;
}

function isBlockedIpv6(address: string): boolean {
  const groups = expandIpv6Groups(address);
  if (!groups) {
    return true; // unparsable IPv6 — fail closed
  }

  const firstValue = Number.parseInt(groups[0], 16);
  const zeroPrefix = groups.slice(0, 5).every((group) => Number.parseInt(group, 16) === 0);
  const high = Number.parseInt(groups[6], 16);
  const low = Number.parseInt(groups[7], 16);

  if (zeroPrefix) {
    const embedded = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
    if (groups[5] === "ffff") {
      // IPv4-mapped: ::ffff:127.0.0.1 / ::ffff:7f00:1 (WHATWG URL form)
      return isBlockedIpv4(embedded);
    }
    if (groups[5] === "0") {
      // :: (unspecified), ::1 (loopback), ::a.b.c.d (IPv4-compatible)
      if (high === 0 && (low === 0 || low === 1)) {
        return true;
      }
      return isBlockedIpv4(embedded);
    }
  }

  return (
    (firstValue & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (firstValue & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (firstValue & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

export function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isBlockedIpv4(address);
  }
  if (family === 6) {
    return isBlockedIpv6(address);
  }
  return true; // unparsable address — fail closed
}

/**
 * Synchronous SSRF checks. Returns `null` when the URL is acceptable, or a
 * caller-facing reason string when it must be rejected.
 */
export function getBlockedUrlReason(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Base URL must be a valid URL";
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return "Base URL must use the http or https protocol";
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return "Base URL must include a hostname";
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      return "Base URL must not target a loopback, private or link-local IP address";
    }
    return null;
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return "Base URL must not target localhost";
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return "Base URL must not target an internal hostname";
  }
  if (!hostname.includes(".")) {
    // e.g. docker service names (`kolabri-core-api-1`) resolved by the
    // embedded DNS — never a public provider endpoint.
    return "Base URL must not target a single-label internal hostname";
  }

  return null;
}

/**
 * Full SSRF check: synchronous URL checks plus DNS resolution of the hostname.
 * Returns `null` when the URL is safe to fetch, otherwise a reason string.
 */
export async function checkBaseUrlSafety(
  rawUrl: string,
): Promise<string | null> {
  const reason = getBlockedUrlReason(rawUrl);
  if (reason) {
    return reason;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Base URL must be a valid URL";
  }

  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname)) {
    return null; // literal address already vetted above
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return "Base URL host does not resolve";
  }

  if (addresses.length === 0) {
    return "Base URL host does not resolve";
  }

  for (const entry of addresses) {
    if (isBlockedIpAddress(entry.address)) {
      return "Base URL must not target a host that resolves to a private, loopback or link-local IP address";
    }
  }

  return null;
}
