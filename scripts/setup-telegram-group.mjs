import { hiddenInput, telegram, putSecrets, waitToClose } from './telegram-admin.mjs';
import { groupReference, inspectGroup, groupSecrets } from './telegram-group.mjs';

try {
  const botIndex = process.argv.indexOf('--bot');
  const expectedBot = botIndex >= 0 ? process.argv[botIndex + 1]?.replace(/^@/, '') : '';
  if (!expectedBot) throw new Error('Вкажіть username бота через --bot.');
  const token = await hiddenInput('Вставте чинний токен бота (приховано), потім Enter: ');
  if (!/^\d+:[a-zA-Z0-9_-]{20,}$/.test(token)) throw new Error('Некоректний формат токена.');
  console.log('Відкрийте потрібну групу в Telegram Web або скопіюйте посилання на її повідомлення.');
  let reference;
  while (!reference) {
    const value = await hiddenInput('Вставте адресу відкритої групи з Telegram Web (приховано), потім Enter: ');
    try { reference = groupReference(value); }
    catch (error) { console.error(error.message); }
  }
  // Only read-only Bot API calls: no getUpdates, offsets, webhook or privacy-mode changes.
  const group = await inspectGroup((method, data) => telegram(token, method, data), reference, expectedBot);
  console.log(`Перевірена група: ${group.title}`);
  let thread = '';
  if (group.forum) {
    console.log('У групі є теми. Для загальної стрічки залиште поле теми порожнім.');
    thread = await hiddenInput('ID теми (приховано) або Enter без теми: ', { allowEmpty: true });
    if (reference.thread && !thread) console.log('Тему з посилання не обрано; надсилання буде без прив’язки до теми.');
  }
  const values = groupSecrets(group, thread);
  const confirm = await hiddenInput('Якщо це потрібна група, введіть YES і натисніть Enter: ');
  if (confirm !== 'YES') throw new Error('Зміни скасовано, поточний чат залишено.');
  await putSecrets(values);
  console.log('Групу й налаштування теми записано в секрети Cloudflare. Токен бота не змінено.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
await waitToClose();
