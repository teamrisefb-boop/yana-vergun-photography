import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export function hiddenInput(prompt, { allowEmpty = false, maxLength = 512 } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Запустіть помічник в інтерактивному терміналі.');
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const restore = () => {
      process.stdin.off('data', onData);
      // Echo stays disabled during network requests and until this process closes.
      process.stdin.pause();
      process.stdout.write('\n');
    };
    function onData(chunk) {
      for (const char of chunk.toString().replace(/\u001b\[20[01]~/g, '')) {
        if (char === '\u0003') { restore(); reject(new Error('Налаштування скасовано.')); return; }
        if (char === '\r' || char === '\n') {
          if (!allowEmpty && !value.trim()) continue;
          restore(); resolve(value.trim()); return;
        }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue; }
        if (/^[\x20-\x7e]$/.test(char) && value.length < maxLength) value += char;
      }
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

export async function telegram(token, method, data = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(25000),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) throw new Error();
    return body.result;
  } catch {
    throw new Error('Telegram не підтвердив запит. Перевірте токен, доступ бота до чату й підключення.');
  }
}

async function runWrangler(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args, '--config', 'worker/wrangler.jsonc'], {
      cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
      env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error('Не вдалося записати секрети. Перевірте вхід Wrangler.')));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Не вдалося записати секрети. Перевірте вхід Wrangler.')));
    child.stdin.end(input);
  });
}

export async function putSecrets(values) {
  // One deployment updates the group and optional topic together. Other secrets stay unchanged.
  await runWrangler(['secret', 'bulk'], JSON.stringify(values));
}

export async function waitToClose() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  process.stdout.write('Натисніть Enter, щоб закрити це вікно.\n');
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    function onData(chunk) {
      if (!/[\r\n\u0003]/.test(chunk.toString())) return;
      process.stdin.off('data', onData);
      process.stdin.pause();
      resolve();
    }
    process.stdin.on('data', onData);
  });
}
