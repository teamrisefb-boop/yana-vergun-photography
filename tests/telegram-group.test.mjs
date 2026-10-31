import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../assets/phone-number.js';
import { normalizeInstagram, validateBooking } from '../assets/booking-validation.js';
import { telegramMessage, telegramDestination } from '../worker/src/telegram-message.js';
import { createHandler, ALLOWED_ORIGIN } from '../worker/src/index.js';
import { groupReference, inspectGroup, groupSecrets } from '../scripts/telegram-group.mjs';

const data = { name: 'Олег', phone: '+380931353643', instagram: '@username', comment: 'Хочу гарну фотосесію', website: '' };
const now = new Date('2026-10-31T18:42:00Z');
const bindings = () => ({
  TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_CHAT_ID: '-1001234567890',
  BOOKING_IP_LIMIT: { limit: async () => ({ success: true }) },
  BOOKING_SITE_LIMIT: { limit: async () => ({ success: true }) },
});
function request(body) {
  return new Request('https://booking.test/booking', { method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(body),
  });
}

test('all Ukrainian examples normalize equally; international numbers use full metadata', () => {
  for (const value of ['0931353643', '380931353643', '+38 (093) 135-36-43']) {
    assert.equal(normalizePhone(value), '+380931353643');
    assert.equal(validateBooking({ ...data, phone: value }).data.phone, '+380931353643');
  }
  assert.equal(normalizePhone('+44 (20) 7946-0018'), '+442079460018');
  assert.equal(normalizePhone('+1 (202) 555-0123'), '+12025550123');
  for (const value of ['02079460018', '2025550123', '380123456', '+380000000000', '+999123456789',
    '093abc3643', '+380931353643 ext 2', '+380931353643\nspoof', '++380931353643', 931353643]) {
    assert.equal(normalizePhone(value), null);
    assert.equal(validateBooking({ ...data, phone: value }).valid, false);
  }
});

test('Instagram is canonical and never links to third-party domains or non-profile paths', () => {
  for (const value of ['@User.Name', 'User.Name', 'https://instagram.com/User.Name', 'https://www.instagram.com/User.Name/?igsh=sample']) {
    assert.equal(normalizeInstagram(value), '@user.name');
  }
  for (const value of ['https://evil.test/user', 'https://instagram.com.evil.test/user',
    'https://instagram.com@evil.test/user', 'https://evil@instagram.com/user',
    'http://instagram.com/user', 'https://instagram.com/p/post', 'https://instagram.com/explore/',
    'https://instagram.com:444/user', '@bad..name', '@bad.', '@bad/name']) {
    assert.equal(normalizeInstagram(value), null);
  }
});

test('message follows the requested template exactly with no parse_mode or previews', () => {
  const message = telegramMessage(data, now);
  assert.equal(message.text, '📸 НОВА ЗАЯВКА НА ЗЙОМКУ\n\nКлієнт: Олег\nТелефон: +380931353643\nInstagram: @username\n\n💬 Побажання\nХочу гарну фотосесію\n\n🗓 31.10.2026 · 20:42\nYana Vergun · заявка із сайту');
  assert.equal(message.parse_mode, undefined);
  assert.equal(message.reply_markup, undefined);
  assert.deepEqual(message.link_preview_options, { is_disabled: true });
  assert.deepEqual(message.entities.filter(e => e.type === 'bold').map(e => message.text.slice(e.offset, e.offset + e.length)),
    ['📸 НОВА ЗАЯВКА НА ЗЙОМКУ', 'Клієнт:', 'Телефон:', 'Instagram:', '💬 Побажання']);
  const link = message.entities.find(e => e.type === 'text_link');
  assert.equal(link.url, 'https://www.instagram.com/username/');
  assert.equal(message.text.slice(link.offset, link.offset + link.length), '@username');
  assert.ok(message.entities.every(e => !['code', 'pre'].includes(e.type)));
});

test('UTF-16 entity offsets remain correct with surrogate pairs, skin tones and ZWJ names', () => {
  for (const name of ['Олег 🧪', 'Олег 👨‍👩‍👧‍👦 🧑🏽‍💻', 'Клієнт +380931353643 🧪']) {
    const message = telegramMessage({ ...data, name }, now);
    const phone = message.entities.find(e => e.type === 'phone_number');
    assert.equal(message.text.slice(phone.offset, phone.offset + phone.length), data.phone);
    assert.equal(phone.length, data.phone.length);
    assert.equal(phone.offset, message.text.indexOf('Телефон: ') + 'Телефон: '.length);
    assert.notEqual(phone.offset, [...message.text.slice(0, phone.offset)].length);
    for (const entity of message.entities) {
      assert.ok(entity.length > 0 && entity.offset >= 0 && entity.offset + entity.length <= message.text.length);
    }
  }
});

test('empty optional fields remove complete blocks without stray blank rows', () => {
  for (const instagram of ['', '@username']) {
    for (const comment of ['', 'Побажання']) {
      const message = telegramMessage({ ...data, instagram, comment }, now);
      assert.equal(message.text.includes('Instagram:'), Boolean(instagram));
      assert.equal(message.text.includes('💬 Побажання'), Boolean(comment));
      assert.doesNotMatch(message.text, /\n{3,}|не вказано|Europe\/Kyiv|20:42:00/);
      assert.equal(message.text.endsWith('\n'), false);
    }
  }
});

test('server normalizes independently and uses only server-configured group and topic', async () => {
  for (const phone of ['0931353643', '380931353643', '+38 (093) 135-36-43']) {
    let sent;
    const handler = createHandler({ now: () => now, telegramFetch: async (_, options) => {
      sent = JSON.parse(options.body); return Response.json({ ok: true });
    } });
    const env = { ...bindings(), TELEGRAM_MESSAGE_THREAD_ID: '42' };
    const response = await handler(request({ ...data, phone,
      chat_id: 'untrusted', TELEGRAM_CHAT_ID: 'untrusted', message_thread_id: 999 }), env);
    assert.equal(response.status, 200);
    assert.equal(sent.chat_id, env.TELEGRAM_CHAT_ID);
    assert.equal(sent.message_thread_id, 42);
    const entity = sent.entities.find(e => e.type === 'phone_number');
    assert.equal(sent.text.slice(entity.offset, entity.offset + entity.length), '+380931353643');
  }
});

test('invalid phones are field errors and do not call Telegram; invalid destination fails closed', async () => {
  const handler = createHandler({ telegramFetch: () => assert.fail('must not send') });
  const invalid = await handler(request({ ...data, phone: '+380000000000' }), bindings());
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).fields.phone, 'phone');
  for (const value of ['abc', '-5', '0', '9007199254740992', '42.5']) {
    assert.equal(telegramDestination({ ...bindings(), TELEGRAM_MESSAGE_THREAD_ID: value }), null);
    assert.equal((await handler(request(data), { ...bindings(), TELEGRAM_MESSAGE_THREAD_ID: value })).status, 503);
  }
  assert.deepEqual(telegramDestination(bindings()), { chat_id: '-1001234567890' });
  assert.deepEqual(telegramDestination({ ...bindings(), TELEGRAM_MESSAGE_THREAD_ID: '' }), { chat_id: '-1001234567890' });
});

test('group references support private message/topic links and Telegram Web without updates polling', () => {
  assert.deepEqual(groupReference('https://t.me/c/1234567890/77'), { chat: '-1001234567890', thread: '' });
  assert.deepEqual(groupReference('https://t.me/c/1234567890/42/77'), { chat: '-1001234567890', thread: '42' });
  assert.deepEqual(groupReference('https://t.me/c/1234567890/77?thread=42'), { chat: '-1001234567890', thread: '42' });
  assert.deepEqual(groupReference('https://web.telegram.org/a/#-123456789'), { chat: '-123456789', thread: '' });
  assert.deepEqual(groupReference('-123456789'), { chat: '-123456789', thread: '' });
  assert.deepEqual(groupReference('https://t.me/group_name/55'), { chat: '@group_name', thread: '' });
  for (const value of ['https://t.me/+invitation', 'https://t.me/joinchat/invitation']) {
    assert.throws(() => groupReference(value), /Ctrl\+L, Ctrl\+C/);
  }
  for (const value of ['https://t.me/+invitation', 'https://evil.test/c/123/42', 'https://t.me.evil.test/c/123/42',
    'https://user@t.me/c/123/42', '123456789', 'https://t.me/c/9007199254740992/77']) assert.throws(() => groupReference(value));
});

test('group inspection works for ordinary bot members and never modifies webhook/privacy or consumes updates', async () => {
  const calls = [];
  const call = async (method, params) => {
    calls.push({ method, params });
    if (method === 'getMe') return { id: 123, is_bot: true, username: 'YanaVergun_bot', can_read_all_group_messages: false };
    if (method === 'getChat') return { id: -123456789, type: 'group', title: 'Yana Vergun | Заявки', permissions: { can_send_messages: true } };
    if (method === 'getChatMember') return { status: 'member' };
    assert.fail('Unexpected Telegram call');
  };
  const group = await inspectGroup(call, groupReference('-123456789'), 'YanaVergun_bot');
  assert.equal(group.title, 'Yana Vergun | Заявки');
  assert.deepEqual(calls.map(c => c.method), ['getMe', 'getChat', 'getChatMember']);
  assert.deepEqual(groupSecrets(group, ''), { TELEGRAM_CHAT_ID: '-123456789', TELEGRAM_MESSAGE_THREAD_ID: '' });
  assert.throws(() => groupSecrets(group, '42'));
  assert.equal(groupSecrets({ ...group, forum: true }, '42').TELEGRAM_MESSAGE_THREAD_ID, '42');
});

test('group inspection refuses wrong bot, channels, mismatched IDs, absent and muted members', async () => {
  for (const failure of ['wrong-bot', 'channel', 'wrong-id', 'left', 'restricted', 'muted']) {
    const call = async method => {
      if (method === 'getMe') return { id: 123, is_bot: true, username: failure === 'wrong-bot' ? 'Other_bot' : 'YanaVergun_bot' };
      if (method === 'getChat') return { id: failure === 'wrong-id' ? -999 : -123456789, type: failure === 'channel' ? 'channel' : 'group', permissions: { can_send_messages: failure !== 'muted' } };
      return { status: ['left', 'restricted'].includes(failure) ? failure : 'member', is_member: true, can_send_messages: false };
    };
    await assert.rejects(() => inspectGroup(call, groupReference('-123456789'), 'YanaVergun_bot'));
  }
});
