import { extractPdfText } from './datasheet-summarizer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export type PdfFetchSuccess = {
  ok: true;
  text: string;
  byteLength: number;
};

export type PdfFetchFailure = {
  ok: false;
  reason:
    | 'invalid_url'
    | 'unsupported_scheme'
    | 'not_pdf_extension'
    | 'implausible_host'
    | 'ssrf_blocked'
    | 'dns_failed'
    | 'timeout'
    | 'aborted'
    | 'http_error'
    | 'too_large'
    | 'not_a_pdf'
    | 'parse_failed'
    | 'empty_text'
    | 'fetch_failed';
  message: string;
};

export type PdfFetchResult = PdfFetchSuccess | PdfFetchFailure;

export interface FetchPdfOptions {
  /** Per-PDF timeout (HTTP fetch). */
  timeoutMs?: number;
  /** Hard upper bound on bytes accepted from the response. */
  maxBytes?: number;
  /** External signal — aborts the entire fetch (used for global verification budget). */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC = Buffer.from('%PDF');

const DISALLOWED_TLDS = new Set([
  'local', 'localhost', 'internal', 'intranet', 'corp', 'home', 'lan', 'private',
  'test', 'example', 'invalid', 'onion',
]);

function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true;
  if (family === 4) {
    const parts = ip.split('.').map(n => parseInt(n, 10));
    if (parts.some(p => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true; // multicast
  if (lower.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(lower.replace('::ffff:', ''));
  }
  return false;
}

function looksLikeManufacturerHost(host: string): boolean {
  if (!host) return false;
  if (net.isIP(host)) return false;
  if (!host.includes('.')) return false;
  const tld = host.split('.').pop()!.toLowerCase();
  if (DISALLOWED_TLDS.has(tld)) return false;
  if (tld.length < 2) return false;
  return true;
}

function preValidateUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: PdfFetchFailure['reason']; message: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url', message: 'URL could not be parsed' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_scheme', message: `Only https is allowed (got ${url.protocol})` };
  }
  const pathnameLower = url.pathname.toLowerCase();
  if (!pathnameLower.endsWith('.pdf')) {
    return { ok: false, reason: 'not_pdf_extension', message: 'URL pathname must end with .pdf' };
  }
  if (!looksLikeManufacturerHost(url.hostname)) {
    return { ok: false, reason: 'implausible_host', message: `Hostname ${url.hostname} is not a plausible public manufacturer domain` };
  }
  return { ok: true, url };
}

async function assertPublicHost(hostname: string): Promise<{ ok: true } | { ok: false; reason: 'ssrf_blocked' | 'dns_failed'; message: string }> {
  try {
    const addrs = await dnsLookup(hostname, { all: true, verbatim: true });
    if (!addrs || addrs.length === 0) {
      return { ok: false, reason: 'dns_failed', message: 'No A/AAAA records' };
    }
    for (const addr of addrs) {
      if (isPrivateOrReservedIp(addr.address)) {
        return { ok: false, reason: 'ssrf_blocked', message: `Resolves to private/reserved IP ${addr.address}` };
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: 'dns_failed', message: err?.message || 'DNS lookup failed' };
  }
}

const MAX_REDIRECTS = 5;

async function fetchWithManualRedirects(
  initialUrl: URL,
  signal: AbortSignal
): Promise<{ ok: true; response: Response } | { ok: false; reason: PdfFetchFailure['reason']; message: string }> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'DeepFolderBot/1.0 (+https://deepfolder.replit.app)',
        'Accept': 'application/pdf,*/*;q=0.8',
      },
    });

    // 3xx redirects (manual mode surfaces them as opaqueredirect or with status 3xx).
    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location');
    if (!isRedirect || !location) {
      if (response.status >= 400) {
        return { ok: false, reason: 'http_error', message: `HTTP ${response.status}` };
      }
      return { ok: true, response };
    }

    if (hop === MAX_REDIRECTS) {
      return { ok: false, reason: 'http_error', message: `Too many redirects (>${MAX_REDIRECTS})` };
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      return { ok: false, reason: 'invalid_url', message: `Invalid redirect Location: ${location}` };
    }

    // Re-validate every hop: enforce HTTPS + .pdf + plausible host + SSRF.
    const hopValidation = preValidateUrl(nextUrl.toString());
    if (!hopValidation.ok) {
      return { ok: false, reason: hopValidation.reason, message: `Redirect blocked: ${hopValidation.message}` };
    }
    const hopSsrf = await assertPublicHost(hopValidation.url.hostname);
    if (!hopSsrf.ok) {
      return { ok: false, reason: hopSsrf.reason, message: `Redirect blocked: ${hopSsrf.message}` };
    }

    currentUrl = hopValidation.url;
  }
  return { ok: false, reason: 'http_error', message: 'Redirect loop exhausted' };
}

export async function fetchAndExtractPdf(
  rawUrl: string,
  opts: FetchPdfOptions = {}
): Promise<PdfFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const validation = preValidateUrl(rawUrl);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, message: validation.message };
  }
  const url = validation.url;

  const ssrfCheck = await assertPublicHost(url.hostname);
  if (!ssrfCheck.ok) {
    return { ok: false, reason: ssrfCheck.reason, message: ssrfCheck.message };
  }

  // External signal short-circuit
  if (opts.signal?.aborted) {
    return { ok: false, reason: 'aborted', message: 'External signal aborted before fetch' };
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (opts.signal) {
    opts.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  let tmpPath: string | null = null;

  try {
    const fetchResult = await fetchWithManualRedirects(url, controller.signal);
    if (!fetchResult.ok) {
      return { ok: false, reason: fetchResult.reason, message: fetchResult.message };
    }
    const response = fetchResult.response;

    if (!response.ok) {
      return { ok: false, reason: 'http_error', message: `HTTP ${response.status}` };
    }

    const rawContentType = (response.headers.get('content-type') || '').toLowerCase();
    const contentType = rawContentType.split(';')[0].trim();
    const allowedContentTypes = new Set([
      'application/pdf',
      'application/x-pdf',
      'application/acrobat',
      'applications/vnd.pdf',
      'text/pdf',
      'text/x-pdf',
      'binary/octet-stream',
      'application/octet-stream',
      '',
    ]);
    if (!allowedContentTypes.has(contentType)) {
      return { ok: false, reason: 'not_a_pdf', message: `Unexpected Content-Type "${rawContentType}"` };
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength && contentLength > maxBytes) {
      return { ok: false, reason: 'too_large', message: `Content-Length ${contentLength} exceeds ${maxBytes}` };
    }

    if (!response.body) {
      return { ok: false, reason: 'fetch_failed', message: 'Response body missing' };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch {}
          return { ok: false, reason: 'too_large', message: `Stream exceeded ${maxBytes}` };
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
    if (buffer.length < 5 || !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return { ok: false, reason: 'not_a_pdf', message: 'Missing %PDF magic header' };
    }

    tmpPath = path.join(os.tmpdir(), `dfds-${crypto.randomBytes(8).toString('hex')}.pdf`);
    fs.writeFileSync(tmpPath, buffer);

    let text: string;
    try {
      text = await extractPdfText(tmpPath);
    } catch (err: any) {
      return { ok: false, reason: 'parse_failed', message: err?.message || 'pdf_parse_failed' };
    }

    const trimmed = (text || '').trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: 'empty_text', message: 'PDF parsed but contained no text' };
    }

    return { ok: true, text: trimmed, byteLength: buffer.length };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (opts.signal?.aborted) {
        return { ok: false, reason: 'aborted', message: 'External signal aborted fetch' };
      }
      return { ok: false, reason: 'timeout', message: `Aborted after ${timeoutMs}ms` };
    }
    return { ok: false, reason: 'fetch_failed', message: err?.message || 'Unknown fetch error' };
  } finally {
    clearTimeout(timeoutHandle);
    if (opts.signal) {
      opts.signal.removeEventListener('abort', onExternalAbort);
    }
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}
