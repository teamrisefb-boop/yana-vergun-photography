import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^\+?[0-9 ()-]+$/.test(value.trim())) return null;
  let number = value.trim().replace(/[ ()-]/g, '');
  if (/^0\d{9}$/.test(number)) number = '+38' + number;
  else if (/^380\d{9}$/.test(number)) number = '+' + number;
  else if (!number.startsWith('+')) return null;
  try {
    const parsed = parsePhoneNumberWithError(number, { extract: false });
    return parsed.isValid() && !parsed.ext ? parsed.number : null;
  } catch {
    return null;
  }
}
