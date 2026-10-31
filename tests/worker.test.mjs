import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALLOWED_ORIGIN, MAX_BODY_BYTES, createHandler } from '../worker/src/index.js';
import { telegramMessage } from '../worker/src/telegram-message.js';
import { validateBooking } from '../assets/booking-validation.js';

const booking = { name: 'Тестова заявка', phone: '+380 93 135-36-43', instagram: '', comment: '', website: '' };
function limiter(max = Infinity) {
  const counts = new Map();
  return { async limit({ key }) {
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return { success: count <= max };
  } };
}
function env() {
  return { TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_CHAT_ID: '-1001234567890', BOOKING_IP_LIMIT: limiter(3), BOOKING_SITE_LIMIT: limiter(30) };
}
function request(data = booking, options = {}) {
  const { raw, headers, ...rest } = options;
  return new Request('https://booking.test/booking', {
    method: 'POST', headers: { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers },
    body: raw ?? JSON.stringify(data), ...rest,
  });
}
const confirmed = () => Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));

test('success waits for Telegram confirmation; entities, normalized phone and Kyiv time', async () => {
  let sent;
  let confirm;
  const handler = createHandler({
    now: () => new Date('2026-06-24T12:00:00Z'),
    telegramFetch: async (_, options) => {
      sent = JSON.parse(options.body);
      return new Promise(resolve => { confirm = () => resolve(Response.json({ ok: true })); });
    },
  });
  let completed = false;
  const pending = handler(request({ ...booking, comment: '<b>Тест</b> & details' }), env()).then(r => { completed = true; return r; });
  while (!confirm) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(completed, false);
  confirm();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sent.parse_mode, undefined);
  assert.match(sent.text, /📸 НОВА ЗАЯВКА НА ЗЙОМКУ/);
  assert.doesNotMatch(sent.text, /Instagram:/);
  assert.match(sent.text, /Телефон: \+380931353643/);
  assert.match(sent.text, /<b>Тест<\/b> & details/);
  assert.match(sent.text, /24\.06\.2026 · 15:00/);
  assert.doesNotMatch(sent.text, /Europe\/Kyiv|15:00:00/);
  assert.match(sent.text, /Yana Vergun · заявка із сайту/);
  assert.deepEqual(sent.link_preview_options, { is_disabled: true });
});

test('both daylight-saving offsets use Europe/Kyiv', () => {
  assert.match(telegramMessage(booking, new Date('2026-01-10T12:00:00Z')).text, /10\.01\.2026 · 14:00/);
  assert.match(telegramMessage(booking, new Date('2026-07-10T12:00:00Z')).text, /10\.07\.2026 · 15:00/);
});

test('missing, invalid, wrongly typed and overlong fields never reach Telegram', async () => {
  let calls = 0;
  const handler = createHandler({ telegramFetch: () => { calls++; return confirmed(); } });
  const invalid = [null, [], {}, { ...booking, name: '' }, { ...booking, name: '123' },
    { ...booking, name: 'a'.repeat(81) }, { ...booking, phone: 'abc' },
    { ...booking, phone: '1'.repeat(16) }, { ...booking, phone: '1'.repeat(6) },
    { ...booking, phone: 380000000000 }, { ...booking, comment: 'a'.repeat(1501) },
    { ...booking, instagram: 'https://evil.test/username' }, { ...booking, instagram: {} },
    { ...booking, name: 'Test\nSpoof' }, { ...booking, comment: '\u0000' }, { ...booking, instagram: null }];
  for (const data of invalid) {
    assert.equal((await handler(request(data), env())).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal(validateBooking({ ...booking, instagram: '@vergun_ph' }).valid, true);
  assert.equal(validateBooking({ ...booking, instagram: 'https://www.instagram.com/vergun_ph/' }).valid, true);
  assert.equal(validateBooking({ ...booking, comment: 'Line one\nLine two' }).valid, true);
});

test('rejects malformed JSON, invalid UTF-8, media type and large declared/streamed bodies', async () => {
  const handler = createHandler({ telegramFetch: () => { assert.fail('must not send'); } });
  assert.equal((await handler(request(null, { raw: '{' }), env())).status, 400);
  assert.equal((await handler(request(null, { raw: new Uint8Array([0xff]) }), env())).status, 400);
  assert.equal((await handler(request(booking, { headers: { 'Content-Type': 'text/plain' } }), env())).status, 415);
  assert.equal((await handler(request(booking, { headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) } }), env())).status, 413);
  assert.equal((await handler(request(null, { raw: 'a'.repeat(MAX_BODY_BYTES + 1) }), env())).status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES)); c.enqueue(new Uint8Array(1)); c.close(); } });
  assert.equal((await handler(request(null, { raw: stream, duplex: 'half' }), env())).status, 413);
});

test('CORS exact origin, preflight and method routing', async () => {
  const handler = createHandler();
  const preflight = new Request('https://booking.test/booking', { method: 'OPTIONS', headers: {
    Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  const response = await handler(preflight, env());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  for (const origin of ['', 'https://evil.test', `${ALLOWED_ORIGIN}.evil.test`]) {
    const rejected = await handler(request(booking, { headers: { Origin: origin } }), env());
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await handler(new Request('https://booking.test/booking', { headers: { Origin: ALLOWED_ORIGIN } }), env())).status, 405);
  assert.equal((await handler(new Request('https://booking.test/other'), env())).status, 404);
});

test('honeypot and IP/site limits work even with spoofed allowed Origin', async () => {
  let calls = 0;
  const handler = createHandler({ telegramFetch: () => { calls++; return confirmed(); } });
  assert.equal((await handler(request({ ...booking, website: 'spam' }), env())).status, 400);
  assert.equal(calls, 0);
  const bindings = env();
  for (let i = 0; i < 3; i++) assert.equal((await handler(request(), bindings)).status, 200);
  const rejected = await handler(request(), bindings);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('Retry-After'), '60');
  const siteBindings = env();
  siteBindings.BOOKING_SITE_LIMIT = limiter(2);
  for (let i = 1; i <= 3; i++) {
    const response = await handler(request(booking, { headers: { 'CF-Connecting-IP': `192.0.2.${i}` } }), siteBindings);
    assert.equal(response.status, i <= 2 ? 200 : 429);
  }
  assert.equal(calls, 5);
});

test('rate keys do not store raw IPs; missing bindings/IP and limiter failures fail closed', async () => {
  let key;
  const bindings = env();
  bindings.BOOKING_IP_LIMIT = { async limit(data) { key = data.key; return { success: true }; } };
  const handler = createHandler({ telegramFetch: confirmed });
  await handler(request(), bindings);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal((await handler(request(), {})).status, 503);
  const unavailable = env();
  unavailable.BOOKING_IP_LIMIT = { limit() { throw new Error('internal'); } };
  assert.equal((await handler(request(), unavailable)).status, 503);
  assert.equal((await handler(request(booking, { headers: { 'CF-Connecting-IP': '' } }), env())).status, 503);
});

test('Telegram HTTP/ok/malformed JSON/network errors never expose upstream data or claim success', async () => {
  const failures = [
    async () => Response.json({ ok: true }, { status: 500 }),
    async () => Response.json({ ok: false, description: 'private upstream detail' }),
    async () => Response.json({ ok: 'true' }),
    async () => new Response('not JSON'),
    async () => { throw new Error('private upstream detail'); },
  ];
  for (const telegramFetch of failures) {
    const response = await createHandler({ telegramFetch })(request(), env());
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: false, code: 'delivery_failed' });
  }
});

test('timeout covers both fetch and a stalled Telegram response body', async () => {
  for (const telegramFetch of [
    () => new Promise(() => {}),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
  ]) {
    const response = await createHandler({ telegramFetch, timeoutMs: 15 })(request(), env());
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { ok: false, code: 'timeout' });
  }
});

test('deployed rate limits match tests and telemetry is disabled', async () => {
  const config = JSON.parse(await readFile(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.ratelimits.map(r => [r.name, r.simple.limit, r.simple.period]), [
    ['BOOKING_IP_LIMIT', 3, 60], ['BOOKING_SITE_LIMIT', 30, 60],
  ]);
});
