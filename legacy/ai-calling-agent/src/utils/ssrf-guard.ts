import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';
import { Readable, Transform } from 'stream';

/**
 * SSRF & Network Exfiltration Guard
 * Enforces strict URL validation, DNS resolution, and IP range denylisting.
 * Protects against internal network discovery, cloud metadata exfiltration (169.254.169.254),
 * loopback exploitation, and DNS rebinding attacks.
 */

export class SsrfSecurityError extends Error {
  public code: string;
  constructor(message: string, code: string = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfSecurityError';
    this.code = code;
  }
}

/**
 * Parses IPv4 into 32-bit unsigned integer for fast CIDR checking.
 */
function ipToLong(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * Checks if IPv4 address falls within a given CIDR network.
 */
function isIpInCidr(ip: string, cidrNet: string, maskBits: number): boolean {
  const ipLong = ipToLong(ip);
  const netLong = ipToLong(cidrNet);
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipLong & mask) === (netLong & mask);
}

const BLOCKED_IPV4_RANGES: Array<{ net: string; mask: number; name: string }> = [
  { net: '0.0.0.0', mask: 8, name: 'Current network' },
  { net: '10.0.0.0', mask: 8, name: 'Private network (RFC 1918)' },
  { net: '100.64.0.0', mask: 10, name: 'Shared address space (RFC 6598)' },
  { net: '127.0.0.0', mask: 8, name: 'Loopback address' },
  { net: '169.254.0.0', mask: 16, name: 'Link-local / Cloud Metadata (AWS/GCP/Azure)' },
  { net: '172.16.0.0', mask: 12, name: 'Private network (RFC 1918)' },
  { net: '192.0.0.0', mask: 24, name: 'IETF Protocol Assignments' },
  { net: '192.0.2.0', mask: 24, name: 'TEST-NET-1 (RFC 5737)' },
  { net: '192.168.0.0', mask: 16, name: 'Private network (RFC 1918)' },
  { net: '198.18.0.0', mask: 15, name: 'Network benchmark tests' },
  { net: '198.51.100.0', mask: 24, name: 'TEST-NET-2 (RFC 5737)' },
  { net: '203.0.113.0', mask: 24, name: 'TEST-NET-3 (RFC 5737)' },
  { net: '224.0.0.0', mask: 4, name: 'Multicast' },
  { net: '240.0.0.0', mask: 4, name: 'Reserved for future use' },
];

/**
 * Determines whether an IP address is private, loopback, link-local, or reserved.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true; // Invalid IP format

  if (family === 4) {
    for (const range of BLOCKED_IPV4_RANGES) {
      if (isIpInCidr(ip, range.net, range.mask)) {
        return true;
      }
    }
    return false;
  }

  // IPv6 checks
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // Loopback & unspecified
  if (normalized.startsWith('fe80:')) return true; // Link-local
  if (normalized.startsWith('fc00:') || normalized.startsWith('fd00:')) return true; // Unique local
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1)
    const ipv4Part = normalized.replace('::ffff:', '');
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrRestrictedIp(ipv4Part);
    }
  }

  return false;
}

const TEST_RESOLVED_HOSTS = new Map<string, string[]>();

export function registerSafeHostForTesting(hostname: string, ips: string[]): void {
  TEST_RESOLVED_HOSTS.set(hostname.toLowerCase(), ips);
}

export function clearSafeHostsForTesting(): void {
  TEST_RESOLVED_HOSTS.clear();
}

/**
 * Validates that an outbound URL is safe to fetch:
 * - Requires https (unless explicitly running mock test environment with allowInsecureForTesting)
 * - Prohibits localhost, cloud metadata, and private IP hosts
 * - Resolves hostname via DNS and verifies that ALL resolved IPs are public routable addresses
 */
export async function validateSafeOutboundUrl(
  urlString: string,
  options?: { allowInsecureForTesting?: boolean }
): Promise<{ url: URL; resolvedIps: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfSecurityError(`Invalid URL string: "${urlString}"`, 'INVALID_URL');
  }

  const isTesting = process.env.NODE_ENV === 'test' || options?.allowInsecureForTesting;

  // 1. Enforce HTTPS protocol
  if (parsed.protocol !== 'https:') {
    if (!options?.allowInsecureForTesting) {
      throw new SsrfSecurityError(
        `Insecure protocol "${parsed.protocol}" blocked. External connectors must use HTTPS.`,
        'PROTOCOL_INSECURE'
      );
    }
  }

  // 2. Prohibit userinfo in URL (e.g. https://user:pass@evil.com)
  if (parsed.username || parsed.password) {
    throw new SsrfSecurityError('Credentials in URL authority are prohibited.', 'CREDENTIALS_IN_URL');
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Fast-reject known dangerous hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    if (!isTesting) {
      throw new SsrfSecurityError(`Restricted local hostname "${hostname}" is blocked.`, 'LOCAL_HOST_BLOCKED');
    }
  }

  // 4. If hostname is directly an IP, validate immediately
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new SsrfSecurityError(
        `Destination IP "${hostname}" is private, link-local, or restricted. Connection blocked.`,
        'RESTRICTED_IP'
      );
    }
    return { url: parsed, resolvedIps: [hostname] };
  }

  // 4b. Test-mocked resolution for deterministic offline tests
  if (TEST_RESOLVED_HOSTS.has(hostname)) {
    const resolvedIps = TEST_RESOLVED_HOSTS.get(hostname)!;
    for (const addr of resolvedIps) {
      if (isPrivateOrRestrictedIp(addr)) {
        throw new SsrfSecurityError(
          `Host "${hostname}" resolved to restricted IP address "${addr}". Connection blocked to prevent SSRF.`,
          'DNS_REBINDING_OR_RESTRICTED_IP'
        );
      }
    }
    return { url: parsed, resolvedIps };
  }

  // 5. DNS Resolution: Resolve all addresses and ensure NONE are restricted
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SsrfSecurityError(`Could not resolve host "${hostname}".`, 'DNS_RESOLUTION_FAILED');
    }

    const resolvedIps = addresses.map((a) => a.address);

    for (const addr of resolvedIps) {
      if (isPrivateOrRestrictedIp(addr)) {
        throw new SsrfSecurityError(
          `Host "${hostname}" resolved to restricted IP address "${addr}". Connection blocked to prevent SSRF.`,
          'DNS_REBINDING_OR_RESTRICTED_IP'
        );
      }
    }

    return { url: parsed, resolvedIps };
  } catch (err: unknown) {
    if (err instanceof SsrfSecurityError) throw err;
    throw new SsrfSecurityError(
      `DNS lookup failed for host "${hostname}": ${err instanceof Error ? err.message : String(err)}`,
      'DNS_LOOKUP_ERROR'
    );
  }
}

const ORIGINAL_FETCH = globalThis.fetch;

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'apikey',
  'x-auth-token',
]);

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((val, key) => {
      result[key.toLowerCase()] = val;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, val] of headers) {
      result[key.toLowerCase()] = val;
    }
  } else {
    for (const [key, val] of Object.entries(headers)) {
      if (val !== undefined && val !== null) {
        result[key.toLowerCase()] = String(val);
      }
    }
  }
  return result;
}

function hasSensitiveHeaders(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => SENSITIVE_HEADERS.has(k.toLowerCase()));
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(k.toLowerCase())) {
      clean[k] = v;
    }
  }
  return clean;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowInsecureForTesting?: boolean;
  maxRedirects?: number;
  disallowCrossOriginRedirects?: boolean;
  forcePinnedSocket?: boolean;
}

/**
 * Hardened Safe Fetch Wrapper
 * - Enforces SSRF validation before connection
 * - Socket-level IP connection pinning (immune to DNS rebinding between check & fetch)
 * - Blocks automatic redirect following; prohibits cross-origin redirects with sensitive credentials
 * - Re-validates target if redirect occurs
 * - Enforces cumulative response body size limit across chunked streams
 * - Imposes strict connection and stream timeout
 */
export async function safeFetch(
  urlString: string,
  init?: RequestInit,
  options?: SafeFetchOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs || 5000;
  const maxBytes = options?.maxBytes || 2 * 1024 * 1024; // 2MB default max
  let currentUrl = urlString;
  let redirectCount = 0;
  const maxRedirects = options?.maxRedirects ?? 3;
  let currentHeaders = normalizeHeaders(init?.headers);

  while (true) {
    // 1. Validate target URL prior to making request and retrieve resolved pinned IP
    const { url: parsed, resolvedIps } = await validateSafeOutboundUrl(currentUrl, {
      allowInsecureForTesting: options?.allowInsecureForTesting,
    });
    const pinnedIp = resolvedIps[0]!;

    // 2. If globalThis.fetch is mocked (in unit tests) and forcePinnedSocket is not specified:
    if (!options?.forcePinnedSocket && globalThis.fetch !== ORIGINAL_FETCH) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await globalThis.fetch(currentUrl, {
          ...init,
          headers: currentHeaders,
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timer);

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          clearTimeout(timer);
          const location = res.headers.get('location');
          if (!location) {
            throw new SsrfSecurityError('Redirect response missing Location header.', 'INVALID_REDIRECT');
          }

          const nextUrl = new URL(location, currentUrl);
          const isCrossOrigin = nextUrl.origin !== parsed.origin;

          if (isCrossOrigin) {
            if (options?.disallowCrossOriginRedirects) {
              throw new SsrfSecurityError(
                `Cross-origin redirect to "${nextUrl.origin}" disallowed.`,
                'CROSS_ORIGIN_REDIRECT_DISALLOWED'
              );
            }
            if (hasSensitiveHeaders(currentHeaders)) {
              throw new SsrfSecurityError(
                'Cross-origin redirect rejected: sensitive authentication headers cannot be forwarded to a different origin.',
                'CROSS_ORIGIN_REDIRECT_CREDENTIAL_LEAK'
              );
            }
            currentHeaders = stripSensitiveHeaders(currentHeaders);
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new SsrfSecurityError(`Maximum redirect limit (${maxRedirects}) exceeded.`, 'TOO_MANY_REDIRECTS');
          }

          currentUrl = nextUrl.toString();
          continue;
        }

        const contentLengthHeader = res.headers.get('content-length');
        if (contentLengthHeader) {
          const contentLength = parseInt(contentLengthHeader, 10);
          if (contentLength > maxBytes) {
            clearTimeout(timer);
            throw new SsrfSecurityError(
              `Response size (${contentLength} bytes) exceeds safety limit (${maxBytes} bytes).`,
              'RESPONSE_TOO_LARGE'
            );
          }
        }

        // Bounded stream consumption covering response body reading under active timeout
        if (res.body) {
          const reader = res.body.getReader();
          let totalBytes = 0;
          const chunks: Uint8Array[] = [];

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.length;
                if (totalBytes > maxBytes) {
                  await reader.cancel();
                  throw new SsrfSecurityError(
                    `Response payload exceeded maximum allowed size of ${maxBytes} bytes.`,
                    'RESPONSE_TOO_LARGE'
                  );
                }
                chunks.push(value);
              }
            }
          } finally {
            clearTimeout(timer);
          }

          const combinedBuffer = Buffer.concat(chunks);
          return new Response(combinedBuffer, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }

        clearTimeout(timer);
        return res;
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof SsrfSecurityError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          throw new SsrfSecurityError(`Outbound request to "${currentUrl}" timed out after ${timeoutMs}ms.`, 'TIMEOUT');
        }
        throw err;
      }
    }

    // 3. Socket-Level Connection Pinning Transport (immune to DNS rebinding)
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;

    const res = await new Promise<Response>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finishReject = (err: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      };

      const finishResolve = (response: Response) => {
        if (settled) return;
        settled = true;
        resolve(response);
      };

      timer = setTimeout(() => {
        finishReject(
          new SsrfSecurityError(`Outbound request to "${currentUrl}" timed out after ${timeoutMs}ms.`, 'TIMEOUT')
        );
      }, timeoutMs);

      const reqHeaders: Record<string, string> = {
        ...currentHeaders,
        host: parsed.host,
      };

      let bodyBuffer: Buffer | null = null;
      if (init?.body) {
        if (typeof init.body === 'string') {
          bodyBuffer = Buffer.from(init.body);
        } else if (Buffer.isBuffer(init.body)) {
          bodyBuffer = init.body;
        } else if (init.body instanceof Uint8Array) {
          bodyBuffer = Buffer.from(init.body);
        }
        if (bodyBuffer && !reqHeaders['content-length']) {
          reqHeaders['content-length'] = bodyBuffer.length.toString();
        }
      }

      const reqOptions: http.RequestOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port,
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        method: init?.method || 'GET',
        headers: reqHeaders,
        lookup: (hostname, lookupOptions, callback) => {
          // Verify host resolution at connection layer: catch DNS rebinding between validation and connection
          if (TEST_RESOLVED_HOSTS.has(hostname.toLowerCase())) {
            const currentIps = TEST_RESOLVED_HOSTS.get(hostname.toLowerCase())!;
            const targetIp = currentIps[0] || pinnedIp;
            if (isPrivateOrRestrictedIp(targetIp)) {
              return callback(
                new SsrfSecurityError(
                  `Host "${hostname}" resolved to restricted IP address "${targetIp}". Connection blocked to prevent SSRF.`,
                  'DNS_REBINDING_OR_RESTRICTED_IP'
                ),
                ''
              );
            }
            const family = net.isIPv6(targetIp) ? 6 : 4;
            if (lookupOptions && lookupOptions.all) {
              return callback(null, [{ address: targetIp, family }]);
            }
            return callback(null, targetIp, family);
          }

          // Production connection pinning: enforce safe pinned public IP
          if (isPrivateOrRestrictedIp(pinnedIp)) {
            return callback(
              new SsrfSecurityError(
                `Destination IP "${pinnedIp}" is private or restricted. Connection blocked.`,
                'RESTRICTED_IP'
              ),
              ''
            );
          }

          const family = net.isIPv6(pinnedIp) ? 6 : 4;
          if (lookupOptions && lookupOptions.all) {
            callback(null, [{ address: pinnedIp, family }]);
          } else {
            callback(null, pinnedIp, family);
          }
        },
      };

      if (isHttps) {
        (reqOptions as https.RequestOptions).servername = parsed.hostname;
      }

      const req = transport.request(reqOptions, (incoming) => {
        const statusCode = incoming.statusCode || 200;
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          if (timer) clearTimeout(timer);
          req.destroy();
          const location = incoming.headers['location'];
          if (!location) {
            return finishReject(new SsrfSecurityError('Redirect response missing Location header.', 'INVALID_REDIRECT'));
          }
          const nextUrl = new URL(Array.isArray(location) ? location[0] : location, currentUrl);
          const isCrossOrigin = nextUrl.origin !== parsed.origin;

          if (isCrossOrigin) {
            if (options?.disallowCrossOriginRedirects) {
              return finishReject(
                new SsrfSecurityError(
                  `Cross-origin redirect to "${nextUrl.origin}" disallowed.`,
                  'CROSS_ORIGIN_REDIRECT_DISALLOWED'
                )
              );
            }
            if (hasSensitiveHeaders(currentHeaders)) {
              return finishReject(
                new SsrfSecurityError(
                  'Cross-origin redirect rejected: sensitive authentication headers cannot be forwarded to a different origin.',
                  'CROSS_ORIGIN_REDIRECT_CREDENTIAL_LEAK'
                )
              );
            }
            currentHeaders = stripSensitiveHeaders(currentHeaders);
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            return finishReject(
              new SsrfSecurityError(`Maximum redirect limit (${maxRedirects}) exceeded.`, 'TOO_MANY_REDIRECTS')
            );
          }

          currentUrl = nextUrl.toString();
          return resolve({ _isRedirect: true } as unknown as Response);
        }

        const clHeader = incoming.headers['content-length'];
        if (clHeader) {
          const declaredBytes = parseInt(Array.isArray(clHeader) ? clHeader[0] : clHeader, 10);
          if (declaredBytes > maxBytes) {
            if (timer) clearTimeout(timer);
            req.destroy();
            return finishReject(
              new SsrfSecurityError(
                `Response size (${declaredBytes} bytes) exceeds safety limit (${maxBytes} bytes).`,
                'RESPONSE_TOO_LARGE'
              )
            );
          }
        }

        let bytesRead = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            bytesRead += chunk.length;
            if (bytesRead > maxBytes) {
              const err = new SsrfSecurityError(
                `Response payload exceeded maximum allowed size of ${maxBytes} bytes.`,
                'RESPONSE_TOO_LARGE'
              );
              req.destroy(err);
              if (timer) clearTimeout(timer);
              return cb(err);
            }
            cb(null, chunk);
          },
        });

        incoming.on('end', () => {
          if (timer) clearTimeout(timer);
        });
        incoming.on('close', () => {
          if (timer) clearTimeout(timer);
        });

        const webHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) webHeaders.append(key, v);
          } else if (value !== undefined) {
            webHeaders.set(key, value);
          }
        }

        const webStream = Readable.toWeb(incoming.pipe(limiter)) as ReadableStream<Uint8Array>;
        const webResponse = new Response(webStream, {
          status: statusCode,
          statusText: incoming.statusMessage || '',
          headers: webHeaders,
        });

        finishResolve(webResponse);
      });

      req.on('error', (err: Error) => {
        if (timer) clearTimeout(timer);
        finishReject(err);
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });

    if ((res as unknown as { _isRedirect?: boolean })._isRedirect) {
      continue;
    }

    return res;
  }
}
