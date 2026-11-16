import { isIP } from "node:net";
import type { Context } from "hono";
import type { ApiEnv } from "./context.js";

/**
 * Client address for rate limiting. `X-Forwarded-For` is NEVER trusted by default: it is only read
 * when the TCP peer is an explicitly configured trusted proxy (`WORKOS_TRUSTED_PROXIES`, comma-
 * separated exact IPs; the keyword `loopback` means 127.0.0.1 and ::1). The chain is then walked
 * from the right, skipping trusted proxies, and the first untrusted, well-formed address wins.
 *
 * Fail-safe: when the socket address is unavailable the request falls into one shared `unknown`
 * bucket (stricter, never looser); a malformed forwarded entry yields the proxy address itself.
 */
export const UNKNOWN_CLIENT_ADDRESS = "unknown";

function normalize(address: string | null | undefined): string | null {
  if (!address) return null;
  let value = address.trim();
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
  return isIP(value) ? value.toLowerCase() : null;
}

export function parseTrustedProxies(raw: string | undefined): ReadonlySet<string> {
  const trusted = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const item = entry.trim().toLowerCase();
    if (!item) continue;
    if (item === "loopback") {
      trusted.add("127.0.0.1");
      trusted.add("::1");
      continue;
    }
    const address = normalize(item);
    if (address) trusted.add(address);
  }
  return trusted;
}

export function resolveClientAddress(input: { socketAddress: string | null | undefined; forwardedFor: string | undefined; trustedProxies: ReadonlySet<string> }): string {
  const peer = normalize(input.socketAddress);
  if (!peer) return UNKNOWN_CLIENT_ADDRESS;
  if (!input.trustedProxies.has(peer) || !input.forwardedFor) return peer;
  const chain = input.forwardedFor.split(",").map((part) => part.trim()).filter(Boolean);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const hop = normalize(chain[index]);
    if (!hop) return peer;
    if (!input.trustedProxies.has(hop)) return hop;
  }
  return peer;
}

function socketAddress(c: Context<ApiEnv>): string | null {
  // @hono/node-server exposes the Node request as c.env.incoming (or c.env.server.incoming).
  const bindings = c.env as unknown as { incoming?: { socket?: { remoteAddress?: string } }; server?: { incoming?: { socket?: { remoteAddress?: string } } } } | undefined;
  return bindings?.incoming?.socket?.remoteAddress ?? bindings?.server?.incoming?.socket?.remoteAddress ?? null;
}

export function clientAddress(c: Context<ApiEnv>): string {
  const env = c.get("env") ?? process.env;
  return resolveClientAddress({
    socketAddress: socketAddress(c),
    forwardedFor: c.req.header("x-forwarded-for"),
    trustedProxies: parseTrustedProxies(env.WORKOS_TRUSTED_PROXIES),
  });
}
