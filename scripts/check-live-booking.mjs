import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { BOOKING_ENDPOINT } from '../assets/booking-config.js';

// Sending is opt-in and performs exactly one synthetic submission through the public UI.
const sendTest = process.argv.includes('--send-test');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  await page.goto('https://teamrisefb-boop.github.io/yana-vergun-photography/?booking=telegram', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#form')?.noValidate === true);
  await page.locator('#loader').waitFor({ state: 'hidden', timeout: 20000 });
  await page.locator('#curtain').waitFor({ state: 'hidden', timeout: 20000 });
  const form = page.locator('#form');
  await form.scrollIntoViewIfNeeded();
  const ctas = await page.locator('a[data-en="Book a shoot"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  if (ctas.length !== 3 || ctas.some(href => href !== '#form')) throw new Error('Booking CTA verification failed.');
  if (sendTest) {
    await page.locator('[name="name"]').fill('Тест групи Codex 🧪');
    await page.locator('[name="phone"]').fill('+38 (093) 135-36-43');
    await page.locator('[name="instagram"]').fill('https://www.instagram.com/vergun_ph/');
    await page.locator('[name="comment"]').fill('ТЕСТ ГРУПИ з опублікованого сайту. Перевірка телефону й форматування, не бронювання.');
    const responsePromise = page.waitForResponse(r => r.url() === BOOKING_ENDPOINT && r.request().method() === 'POST');
    await page.locator('#submitBtn').click();
    const response = await responsePromise;
    const result = await response.json();
    await page.waitForFunction(() => document.querySelector('#form').getAttribute('aria-busy') === 'false');
    const success = response.ok() && result?.ok === true;
    console.log(JSON.stringify({ httpStatus: response.status(), telegramConfirmed: success, uiState: await page.locator('#formStatus').getAttribute('data-state') }));
    if (!success) throw new Error('Delivery is not confirmed. Inputs remain in the form; no automatic retry was made.');
    if (await page.locator('[name="name"]').inputValue()) throw new Error('Confirmed form did not reset.');
  }
  await mkdir('test-results', { recursive: true });
  await form.screenshot({ path: 'test-results/booking-desktop.png' });
  await page.locator('[data-lang="en"]').click();
  if (await page.locator('#submitLabel').textContent() !== 'Send request') throw new Error('English button verification failed.');
  await page.locator('[data-lang="uk"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await form.scrollIntoViewIfNeeded();
  await form.screenshot({ path: 'test-results/booking-mobile.png' });
  const bounds = await form.boundingBox();
  if (bounds.x < 0 || bounds.x + bounds.width > 391) throw new Error('Mobile form overflows.');
  console.log('Published form, booking anchors, UA/EN and mobile layout verified.');
  if (!sendTest) console.log('Read-only check: no booking sent.');
} finally {
  await browser.close();
}
