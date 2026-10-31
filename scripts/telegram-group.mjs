function numericId(value) {
  return /^-[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

export function groupReference(value) {
  if (numericId(value)) return { chat: value, thread: '' };
  let url;
  try { url = new URL(value); } catch { throw new Error('Потрібне посилання на повідомлення/Telegram Web або точний від’ємний ID групи.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Некоректне посилання Telegram.');
  if (url.hostname === 'web.telegram.org' && /^\/(?:a|k)\/$/.test(url.pathname)) {
    const id = url.hash.slice(1);
    if (numericId(id)) return { chat: id, thread: '' };
  }
  if (url.hostname === 't.me') {
    const privateLink = url.pathname.match(/^\/c\/([1-9]\d*)\/([1-9]\d*)(?:\/([1-9]\d*))?\/?$/);
    if (privateLink) {
      const chat = '-100' + privateLink[1];
      const thread = privateLink[3] ? privateLink[2] : (url.searchParams.get('thread') || '');
      if (numericId(chat) && (!thread || /^[1-9]\d*$/.test(thread))) return { chat, thread };
    }
    const publicLink = url.pathname.match(/^\/([a-zA-Z][a-zA-Z0-9_]{3,31})\/([1-9]\d*)(?:\/([1-9]\d*))?\/?$/);
    if (publicLink) return { chat: '@' + publicLink[1], thread: publicLink[3] ? publicLink[2] : (url.searchParams.get('thread') || '') };
  }
  throw new Error('Це не підтримуване посилання на повідомлення/чат. Посилання-запрошення не підходить.');
}

export async function inspectGroup(call, reference, expectedBot) {
  const bot = await call('getMe');
  if (!bot?.is_bot || !bot.username || bot.username.toLowerCase() !== expectedBot.toLowerCase()) {
    throw new Error('Токен належить іншому боту. Секрети не змінено.');
  }
  const chat = await call('getChat', { chat_id: reference.chat });
  const id = String(chat?.id);
  if (!['group', 'supergroup'].includes(chat?.type) || !numericId(id)) throw new Error('Потрібна група або супергрупа, доступна боту.');
  if (reference.chat.startsWith('-') && reference.chat !== id) throw new Error('ID у відповіді не відповідає вибраній групі.');
  const member = await call('getChatMember', { chat_id: id, user_id: bot.id });
  const privileged = ['administrator', 'creator'].includes(member?.status);
  if (['left', 'kicked'].includes(member?.status) || !['member', 'restricted', 'administrator', 'creator'].includes(member?.status)) {
    throw new Error('Спочатку додайте бота до групи.');
  }
  if (!privileged && (chat.permissions?.can_send_messages === false ||
      (member.status === 'restricted' && (!member.is_member || member.can_send_messages !== true)))) {
    throw new Error('Дозвольте боту надсилати текстові повідомлення в цій групі. Права адміністратора не потрібні.');
  }
  return { id, title: String(chat.title || '').replace(/[\u0000-\u001f\u007f]/g, ''), forum: chat.is_forum === true };
}

export function groupSecrets(group, thread) {
  if (!numericId(group.id)) throw new Error('Некоректний ID групи.');
  if (thread && (!group.forum || !/^[1-9]\d*$/.test(thread) || !Number.isSafeInteger(Number(thread)))) {
    throw new Error('Тема має бути додатним числовим ID у групі з увімкненими темами.');
  }
  return { TELEGRAM_CHAT_ID: group.id, TELEGRAM_MESSAGE_THREAD_ID: thread };
}
