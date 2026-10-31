import { normalizePhone } from './phone-number.js';

export const LIMITS = Object.freeze({ name: 80, phone: 32, instagram: 100, comment: 1500, website: 200 });

export function normalizeInstagram(value) {
  if (!value) return '';
  let username = value;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password) return null;
      const match = url.pathname.match(/^\/([a-zA-Z0-9_.]{1,30})\/?$/);
      if (!match) return null;
      username = match[1];
    } catch { return null; }
  } else {
    username = username.replace(/^@/, '');
  }
  if (!/^[a-zA-Z0-9_](?:[a-zA-Z0-9_.]{0,28}[a-zA-Z0-9_])?$/.test(username) || username.includes('..')) return null;
  if (['accounts', 'explore', 'reels', 'reel', 'p', 'stories', 'direct', 'about', 'developer', 'legal'].includes(username.toLowerCase())) return null;
  return '@' + username.toLowerCase();
}

export function validateBooking(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { form: 'invalid' } };
  }
  const data = {};
  const errors = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const value = input[field] === undefined ? '' : input[field];
    if (typeof value !== 'string' || value.length > max) {
      errors[field] = 'invalid';
      continue;
    }
    data[field] = value.replace(/\r\n?/g, '\n').trim();
    const controls = field === 'comment'
      ? /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
      : /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
    if (controls.test(data[field])) errors[field] = 'invalid';
  }
  if (!data.name || !/\p{L}/u.test(data.name)) errors.name = 'name';
  const phone = normalizePhone(data.phone);
  if (!phone) errors.phone = 'phone';
  else data.phone = phone;
  const instagram = normalizeInstagram(data.instagram);
  if (instagram === null) errors.instagram = 'instagram';
  else data.instagram = instagram;
  if (data.website) errors.website = 'invalid';
  return { valid: Object.keys(errors).length === 0, errors, data };
}
