import { validateBooking } from '../../assets/booking-validation.js';
import { telegramMessage, telegramDestination } from './telegram-message.js';

export const ALLOWED_ORIGIN = 'https://teamrisefb-boop.github.io';
export const MAX_BODY_BYTES = 8192;
const TELEGRAM_TIMEOUT_MS = 8000;

class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function readBody(request) {
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new RequestError(413, 'too_large');
  }
  if (!request.body) throw new RequestError(400, 'invalid');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestError(408, 'invalid'));
      void reader.cancel().catch(() => {});
    }, 3000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new RequestError(413, 'too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'invalid');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// Dependencies are injectable for offline tests; production always uses fetch and the real clock.
export function createHandler({ telegramFetch = fetch, now = () => new Date(), timeoutMs = TELEGRAM_TIMEOUT_MS } = {}) {
  return async function handle(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
    };
    if (origin === ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
    const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), {
      status, headers: { ...headers, ...extra },
    });
    if (new URL(request.url).pathname !== '/booking') return reply(404, { ok: false, code: 'not_found' });
    if (origin !== ALLOWED_ORIGIN) return reply(403, { ok: false, code: 'forbidden' });
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'POST') {
        return reply(405, { ok: false, code: 'method' }, { Allow: 'POST, OPTIONS' });
      }
      const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
        .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (requestedHeaders.some(h => h !== 'content-type')) return reply(403, { ok: false, code: 'forbidden' });
      return new Response(null, { status: 204, headers: {
        ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600',
      } });
    }
    if (request.method !== 'POST') return reply(405, { ok: false, code: 'method' }, { Allow: 'POST, OPTIONS' });
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, { ok: false, code: 'content_type' });
    }
    try {
      const destination = telegramDestination(env);
      if (!env.TELEGRAM_BOT_TOKEN || !destination ||
          !env.BOOKING_IP_LIMIT || !env.BOOKING_SITE_LIMIT) {
        return reply(503, { ok: false, code: 'unavailable' });
      }
      // Cloudflare supplies this header. Never trust X-Forwarded-For from the caller.
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) return reply(503, { ok: false, code: 'unavailable' });
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      if (!(await env.BOOKING_IP_LIMIT.limit({ key })).success ||
          !(await env.BOOKING_SITE_LIMIT.limit({ key: 'booking' })).success) {
        return reply(429, { ok: false, code: 'rate_limited' }, { 'Retry-After': '60' });
      }
      const result = validateBooking(await readBody(request));
      if (!result.valid) return reply(400, { ok: false, code: 'invalid', fields: result.errors });

      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RequestError(504, 'timeout'));
        }, timeoutMs);
      });
      try {
        // Keep the deadline active while reading Telegram's JSON, too.
        const delivery = (async () => {
          const response = await telegramFetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...destination, ...telegramMessage(result.data, now()) }),
          });
          if (!response.ok) throw new RequestError(502, 'delivery_failed');
          const body = await response.json();
          if (body?.ok !== true) throw new RequestError(502, 'delivery_failed');
        })();
        await Promise.race([delivery, deadline]);
        return reply(200, { ok: true });
      } catch (error) {
        const timedOut = controller.signal.aborted || error?.code === 'timeout';
        return reply(timedOut ? 504 : 502, { ok: false, code: timedOut ? 'timeout' : 'delivery_failed' });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { ok: false, code: error.code });
      // Do not log requests, exceptions, Telegram URLs, contacts, or upstream bodies.
      return reply(503, { ok: false, code: 'unavailable' });
    }
  };
}

export default { fetch: createHandler() };
