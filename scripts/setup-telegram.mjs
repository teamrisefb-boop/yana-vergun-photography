import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

function hiddenInput() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Запустіть помічник в інтерактивному терміналі PowerShell.');
  }
  process.stdout.write('Вставте токен від BotFather (введення приховане), потім Enter: ');
  return new Promise((resolve, reject) => {
    let value = '';
    const restore = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    function onData(chunk) {
      for (const char of chunk.toString()) {
        if (char === '\u0003') { restore(); reject(new Error('Налаштування скасовано.')); return; }
        if (char === '\r' || char === '\n') { restore(); resolve(value.trim()); return; }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue; }
        if (/^[\x21-\x7e]$/.test(char) && value.length < 256) value += char;
      }
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function telegram(token, method, data = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(25000),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) throw new Error();
    return body.result;
  } catch {
    throw new Error('Telegram не підтвердив запит. Перевірте токен, інтернет і що цей бот не використовується іншим сервером.');
  }
}

async function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, 'secret', 'put', name, '--config', 'worker/wrangler.jsonc'], {
      cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error(`Не вдалося записати ${name}. Перевірте вхід Wrangler.`)));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Не вдалося записати ${name}. Запустіть wrangler login і повторіть.`)));
    // The value is passed through stdin, never a process argument or a file.
    child.stdin.end(value + '\n');
  });
}

try {
  const token = await hiddenInput();
  if (!/^\d+:[a-zA-Z0-9_-]{20,}$/.test(token)) throw new Error('Формат токена не схожий на токен BotFather.');
  const bot = await telegram(token, 'getMe');
  if (!bot.is_bot || !bot.username) throw new Error('Не вдалося підтвердити бота.');
  const webhook = await telegram(token, 'getWebhookInfo');
  if (webhook.url) throw new Error('Бот уже підключений до webhook. Використайте окремого нового бота; наявне підключення не змінено.');
  const marker = 'yv_' + randomBytes(16).toString('hex');
  console.log(`Власниця має зі свого Telegram відкрити https://t.me/${bot.username}?start=${marker} і натиснути Start.`);
  console.log('Очікування до 3 хвилин. Секрети та повідомлення не виводяться й не зберігаються у файлах.');
  let offset = 0;
  let chatId;
  const end = Date.now() + 180000;
  while (!chatId && Date.now() < end) {
    const updates = await telegram(token, 'getUpdates', { offset, timeout: 20, limit: 100, allowed_updates: ['message'] });
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      const message = update.message;
      if (message?.chat?.type === 'private' && message.text === `/start ${marker}`) {
        chatId = String(message.chat.id);
      }
    }
  }
  if (!chatId) throw new Error('Start із посилання не отримано. Запустіть помічник ще раз.');
  await putSecret('TELEGRAM_BOT_TOKEN', token);
  await putSecret('TELEGRAM_CHAT_ID', chatId);
  console.log('Обидва секрети записані в Cloudflare. Тепер перевірте тестову заявку з опублікованого сайту.');
} catch (error) {
  // Only explicitly written safe messages are ever printed; never upstream exceptions.
  console.error(error.message);
  process.exitCode = 1;
}
