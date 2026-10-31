export function telegramMessage(data, now) {
  let text = '';
  const entities = [];
  function append(value, type, extra = {}) {
    if (type) entities.push({ type, offset: text.length, length: value.length, ...extra });
    text += value;
  }
  // JavaScript string lengths/offsets are UTF-16 code units, as required by Telegram.
  append('📸 НОВА ЗАЯВКА НА ЗЙОМКУ', 'bold');
  append('\n\n');
  append('Клієнт:', 'bold');
  append(' ' + data.name + '\n');
  append('Телефон:', 'bold');
  append(' ');
  append(data.phone, 'phone_number');
  if (data.instagram) {
    append('\n');
    append('Instagram:', 'bold');
    append(' ');
    append(data.instagram, 'text_link', { url: `https://www.instagram.com/${data.instagram.slice(1)}/` });
  }
  if (data.comment) {
    append('\n\n');
    append('💬 Побажання', 'bold');
    append('\n' + data.comment);
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  append(`\n\n🗓 ${parts.day}.${parts.month}.${parts.year} · ${parts.hour}:${parts.minute}`);
  append('\nYana Vergun · заявка із сайту');
  return { text, entities, link_preview_options: { is_disabled: true } };
}

export function telegramDestination(env) {
  const chatId = typeof env.TELEGRAM_CHAT_ID === 'string' ? env.TELEGRAM_CHAT_ID.trim() : '';
  if (!/^-?[1-9]\d*$/.test(chatId) || !Number.isSafeInteger(Number(chatId))) return null;
  const thread = env.TELEGRAM_MESSAGE_THREAD_ID;
  if (thread === undefined || thread === '') return { chat_id: chatId };
  if (typeof thread !== 'string' || !/^[1-9]\d*$/.test(thread) || !Number.isSafeInteger(Number(thread))) return null;
  return { chat_id: chatId, message_thread_id: Number(thread) };
}
