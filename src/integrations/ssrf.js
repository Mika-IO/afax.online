// SSRF guard for agent-/user-controlled outbound URLs (e.g. `context ingest`).
// Blocks loopback, private, link-local and cloud-metadata addresses so a
// malicious page/prompt can't make the server fetch its own internal network
// or steal cloud credentials from 169.254.169.254. Zero deps.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // fail closed
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||              // link-local + cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||    // carrier-grade NAT
    a >= 224                                  // multicast / reserved
  );
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  return (
    v === '::1' || v === '::' ||
    v.startsWith('fc') || v.startsWith('fd') ||  // unique-local
    v.startsWith('fe80') ||                       // link-local
    v.startsWith('::ffff:') && isPrivateIPv4(v.split(':').pop()) // IPv4-mapped
  );
}

const isPrivate = (ip) => (isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip));

// Throws if the URL is not a public http(s) endpoint. Resolves DNS and checks
// every returned address (defends against DNS-rebinding to a private IP).
export async function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(/^https?:\/\//.test(raw) ? raw : 'https://' + raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Blocked non-http(s) URL: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new Error(`Blocked internal host: ${host}`);
  }
  if (isIP(host)) {
    if (isPrivate(host)) throw new Error(`Blocked private address: ${host}`);
    return u.href;
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) {
    throw new Error(`Blocked host resolving to a private address: ${host}`);
  }
  return u.href;
}
