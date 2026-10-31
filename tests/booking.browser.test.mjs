import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createHandler, ALLOWED_ORIGIN } from '../worker/src/index.js';

const root = new URL('../', import.meta.url);
const site = `${ALLOWED_ORIGIN}/yana-vergun-photography/`;
// This test-only hostname never appears in the published configuration.
const api = 'https://booking.test/booking';
const limiter = () => ({ limit: async () => ({ success: true }) });
const bindings = () => ({ TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_CHAT_ID: '-1001234567890', BOOKING_IP_LIMIT: limiter(), BOOKING_SITE_LIMIT: limiter() });

test('booking in a real browser with offline Telegram responses', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  async function open({ telegramFetch = async () => Response.json({ ok: true }), endpoint = api, timeoutMs, env = bindings(), viewport = { width: 1280, height: 900 } } = {}) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    t.after(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    let calls = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const handler = createHandler({ telegramFetch, timeoutMs });
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.url() === api) {
        calls++;
        const response = await handler(new Request(api, {
          method: request.method(), headers: { ...request.headers(), origin: ALLOWED_ORIGIN, 'cf-connecting-ip': '192.0.2.1' },
          body: request.method() === 'POST' ? request.postData() : undefined,
        }), env);
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      if (!request.url().startsWith(site)) return route.abort();
      const relative = new URL(request.url()).pathname.slice('/yana-vergun-photography/'.length) || 'index.html';
      if (relative === 'assets/booking-config.js') {
        return route.fulfill({ contentType: 'text/javascript', body: `export const BOOKING_ENDPOINT = ${JSON.stringify(endpoint)};` });
      }
      // Large portfolio photos are unrelated to the form tests; load the contact photo for visual QA.
      if (/\.(jpg|png)$/i.test(relative) && !['assets/photo-7.jpg', 'assets/logo.png'].includes(relative)) return route.abort();
      try {
        const body = await readFile(new URL(relative, root));
        const contentType = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.html') ? 'text/html' : relative.endsWith('.png') ? 'image/png' : relative.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
        return route.fulfill({ contentType, body });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto(site);
    await page.waitForFunction(() => document.querySelector('#form').noValidate);
    const form = page.locator('#form');
    await form.scrollIntoViewIfNeeded();
    return { page, form, calls: () => calls, errors };
  }
  async function fill(page) {
    await page.locator('[name="name"]').fill('Тестова заявка');
    await page.locator('[name="phone"]').fill('+380 93 135-36-43');
  }
  const submit = page => page.locator('#submitBtn').click();
  const status = page => page.locator('#formStatus').textContent();

  await t.test('required fields, invalid phone/Instagram and length constraints', async () => {
    const { page, calls } = await open();
    await submit(page);
    assert.equal(calls(), 0);
    assert.equal(await page.locator('[name="name"]').getAttribute('aria-invalid'), 'true');
    await fill(page);
    await page.locator('[name="phone"]').fill('abcdefg');
    await submit(page);
    assert.equal(calls(), 0);
    await page.locator('[name="phone"]').fill('+380 93 135-36-43');
    await page.locator('[name="instagram"]').fill('https://evil.test/profile');
    await submit(page);
    assert.equal(calls(), 0);
    assert.equal(await page.locator('[name="comment"]').getAttribute('maxlength'), '1500');
    assert.equal(await page.locator('[name="name"]').getAttribute('autocomplete'), 'name');
    assert.equal(await page.locator('[name="phone"]').getAttribute('autocomplete'), 'tel');
  });

  await t.test('double submit, in-flight language switch, confirmation and reset', async () => {
    let confirm;
    const { page, form, calls, errors } = await open({ telegramFetch: () => new Promise(resolve => { confirm = () => resolve(Response.json({ ok: true })); }) });
    await fill(page);
    await page.locator('[name="instagram"]').fill('@vergun_ph');
    await page.locator('[name="comment"]').fill('Тест');
    await submit(page);
    await page.waitForFunction(() => document.querySelector('#submitBtn').disabled);
    assert.equal(await page.locator('#submitLabel').textContent(), 'Надсилаємо…');
    await form.dispatchEvent('submit', { bubbles: true, cancelable: true });
    assert.equal(await page.locator('[name="name"]').inputValue(), 'Тестова заявка');
    await page.locator('[data-lang="en"]').click();
    assert.equal(await page.locator('#submitLabel').textContent(), 'Sending…');
    assert.equal(await page.locator('[name="name"]').getAttribute('placeholder'), 'Your name');
    while (!confirm) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(calls(), 1);
    confirm();
    await page.waitForFunction(() => document.querySelector('#formStatus').dataset.state === 'success');
    assert.match(await status(page), /Your request was sent/);
    assert.equal(await page.locator('[name="name"]').inputValue(), '');
    assert.equal(await page.locator('[name="phone"]').inputValue(), '');
    assert.equal(await page.locator('#submitBtn').isDisabled(), false);
    await page.locator('[data-lang="uk"]').click();
    assert.match(await status(page), /Заявку надіслано/);
    assert.equal(await page.locator('#submitLabel').textContent(), 'Надіслати заявку');
    assert.deepEqual(errors, []);
  });

  await t.test('Telegram failure preserves inputs, offers fallback and allows successful retry', async () => {
    let fail = true;
    const { page } = await open({ telegramFetch: async () => Response.json({ ok: !fail }) });
    await fill(page);
    await submit(page);
    await page.waitForFunction(() => document.querySelector('#formStatus').textContent.includes('Не вдалося'));
    assert.equal(await page.locator('[name="name"]').inputValue(), 'Тестова заявка');
    assert.equal(await page.locator('#submitBtn').isDisabled(), false);
    assert.equal(await page.locator('#formTelegram').isVisible(), true);
    assert.equal(await page.locator('#formTelegram').getAttribute('href'), 'https://t.me/yanVergn');
    await page.locator('[data-lang="en"]').click();
    assert.match(await status(page), /Please try again/);
    fail = false;
    await submit(page);
    await page.waitForFunction(() => document.querySelector('#formStatus').dataset.state === 'success');
  });

  await t.test('Worker timeout and rate-limit display translated failures with preserved data', async () => {
    for (const limited of [false, true]) {
      const env = bindings();
      if (limited) env.BOOKING_IP_LIMIT = { limit: async () => ({ success: false }) };
      const { page } = await open({ telegramFetch: () => new Promise(() => {}), timeoutMs: 20, env });
      await fill(page);
      await submit(page);
      await page.waitForFunction(() => document.querySelector('#formStatus').textContent.length > 0);
      assert.match(await status(page), limited ? /Забагато спроб/ : /Не отримано підтвердження/);
      assert.equal(await page.locator('[name="phone"]').inputValue(), '+380 93 135-36-43');
      await page.locator('[data-lang="en"]').click();
      assert.match(await status(page), limited ? /Too many attempts/ : /could not be confirmed/);
      assert.equal(await page.locator('#submitBtn').isDisabled(), false);
    }
  });

  await t.test('empty production endpoint sends nothing and never claims success', async () => {
    const { page, calls } = await open({ endpoint: '' });
    await fill(page);
    await submit(page);
    assert.match(await status(page), /тимчасово недоступні/);
    assert.equal(calls(), 0);
    assert.equal(await page.locator('[name="name"]').inputValue(), 'Тестова заявка');
    assert.equal(await page.locator('#formTelegram').isVisible(), true);
  });

  await t.test('mobile form stays within viewport, honeypot blocks sends, booking CTAs reach form', async () => {
    const { page, form, calls, errors } = await open({ viewport: { width: 390, height: 844 } });
    const links = await page.locator('a[data-en="Book a shoot"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    assert.deepEqual(links, ['#form', '#form', '#form']);
    const bounds = await form.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await fill(page);
    await page.locator('[name="website"]').evaluate(el => { el.value = 'spam'; });
    await submit(page);
    assert.equal(calls(), 0);
    assert.notEqual(await status(page), '');
    assert.equal(await page.locator('#bookingWebsite').getAttribute('tabindex'), '-1');
    assert.deepEqual(errors, []);
  });

  await t.test('Ukrainian phone variants reach Telegram identically; foreign local numbers fail in browser', async () => {
    const numbers = [];
    const { page, calls } = await open({ telegramFetch: async (_, options) => {
      const body = JSON.parse(options.body);
      const entity = body.entities.find(e => e.type === 'phone_number');
      numbers.push(body.text.slice(entity.offset, entity.offset + entity.length));
      return Response.json({ ok: true });
    } });
    for (const phone of ['0931353643', '380931353643', '+38 (093) 135-36-43']) {
      await fill(page);
      await page.locator('[name="phone"]').fill(phone);
      await submit(page);
      await page.waitForFunction(() => document.querySelector('#formStatus').dataset.state === 'success');
    }
    assert.deepEqual(numbers, ['+380931353643', '+380931353643', '+380931353643']);
    await fill(page);
    await page.locator('[name="phone"]').fill('02079460018');
    await submit(page);
    assert.equal(calls(), 3);
    assert.equal(await page.locator('[name="phone"]').getAttribute('aria-invalid'), 'true');
  });

  await t.test('server field errors preserve form and show a translated phone error', async () => {
    const { page } = await open();
    await page.route(api, route => route.fulfill({
      status: 400, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ ok: false, code: 'invalid', fields: { phone: 'phone' } }),
    }));
    await fill(page);
    await submit(page);
    await page.waitForFunction(() => document.querySelector('[name="phone"]').getAttribute('aria-invalid') === 'true');
    assert.equal(await page.locator('[name="phone"]').inputValue(), '+380 93 135-36-43');
    assert.equal(await page.locator('#submitBtn').isDisabled(), false);
    await page.locator('[data-lang="en"]').click();
    assert.match(await page.locator('[name="phone"]').evaluate(el => el.validationMessage), /international number/);
    assert.equal(await page.locator('#formStatus').getAttribute('data-state'), 'error');
  });
});
