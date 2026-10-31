import { BOOKING_ENDPOINT } from './booking-config.js';
import { validateBooking } from './booking-validation.js?v=groups-1';

const copy = {
  uk: {
    idle: 'Надіслати заявку', busy: 'Надсилаємо…',
    success: 'Дякую! Заявку надіслано. Я зв’яжуся з тобою.',
    error: 'Не вдалося надіслати заявку. Спробуйте ще раз або напишіть у Telegram.',
    timeout: 'Не отримано підтвердження надсилання. Перевірте в Telegram або спробуйте ще раз.',
    rate: 'Забагато спроб. Зачекайте хвилину та повторіть або напишіть у Telegram.',
    unavailable: 'Онлайн-заявки тимчасово недоступні. Напишіть у Telegram.',
    invalid: 'Перевірте заповнення полів.', telegram: 'Написати в Telegram',
    name: 'Вкажіть ім’я (до 80 символів).', phone: 'Вкажіть коректний український номер або міжнародний номер з кодом країни (+…).',
    instagram: 'Вкажіть @username або посилання https://instagram.com/username.',
    comment: 'Побажання мають містити не більше 1500 символів.',
  },
  en: {
    idle: 'Send request', busy: 'Sending…',
    success: 'Thank you! Your request was sent. I will get in touch with you.',
    error: 'Could not send your request. Please try again or message me on Telegram.',
    timeout: 'Delivery could not be confirmed. Please check on Telegram or try again.',
    rate: 'Too many attempts. Please wait a minute and try again, or message me on Telegram.',
    unavailable: 'Online requests are temporarily unavailable. Please message me on Telegram.',
    invalid: 'Please check the form fields.', telegram: 'Message on Telegram',
    name: 'Enter your name (up to 80 characters).', phone: 'Enter a valid Ukrainian phone number or an international number with country code (+…).',
    instagram: 'Enter @username or a https://instagram.com/username link.',
    comment: 'Please keep your wishes under 1500 characters.',
  },
};

const form = document.getElementById('form');
if (form) {
  const button = document.getElementById('submitBtn');
  const label = document.getElementById('submitLabel');
  const arrow = button.querySelector('.arr');
  const status = document.getElementById('formStatus');
  const fallback = document.getElementById('formTelegram');
  const fields = ['name', 'phone', 'instagram', 'comment', 'website'];
  let busy = false;
  let state = '';
  let errors = {};
  form.noValidate = true;
  const language = () => document.documentElement.lang === 'en' ? 'en' : 'uk';
  function render() {
    const text = copy[language()];
    label.textContent = text[busy ? 'busy' : 'idle'];
    arrow.hidden = busy;
    button.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
    status.textContent = state ? text[state] : '';
    status.dataset.state = state === 'success' ? 'success' : 'error';
    fallback.hidden = !state || state === 'success' || state === 'invalid';
    fallback.textContent = text.telegram;
    for (const name of fields) {
      const field = form.elements.namedItem(name);
      field.setCustomValidity(errors[name] ? (text[name] || text.invalid) : '');
      field.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
      field.readOnly = busy;
    }
  }
  function endpoint() {
    if (!BOOKING_ENDPOINT) return null;
    try {
      const url = new URL(BOOKING_ENDPOINT);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/booking' || url.search || url.hash) return null;
      return url.href;
    } catch { return null; }
  }
  form.addEventListener('input', event => {
    delete errors[event.target.name];
    if (!busy) state = '';
    render();
  });
  document.addEventListener('site:languagechange', render);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const payload = Object.fromEntries(new FormData(form));
    const validation = validateBooking(payload);
    errors = validation.errors;
    if (!validation.valid) {
      state = 'invalid';
      render();
      form.reportValidity();
      return;
    }
    const url = endpoint();
    if (!url) { state = 'unavailable'; render(); return; }
    busy = true;
    state = '';
    render();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data), signal: controller.signal,
      });
      const result = await response.json();
      if (response.ok && result?.ok === true) {
        form.reset();
        errors = {};
        state = 'success';
      } else {
        if (response.status === 400 && result?.code === 'invalid' && result.fields && typeof result.fields === 'object') {
          errors = Object.fromEntries(fields.filter(name => Object.hasOwn(result.fields, name)).map(name => [name, name]));
          state = 'invalid';
        } else {
          state = response.status === 429 ? 'rate' : result?.code === 'timeout' ? 'timeout' : 'error';
        }
      }
    } catch {
      state = controller.signal.aborted ? 'timeout' : 'error';
    } finally {
      clearTimeout(timer);
      busy = false;
      render();
      if (state === 'invalid') form.reportValidity();
    }
  });
  render();
}
