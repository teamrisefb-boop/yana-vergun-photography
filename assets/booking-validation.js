export const LIMITS = Object.freeze({ name: 80, phone: 32, instagram: 100, comment: 1500, website: 200 });

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
  const digits = (data.phone || '').replace(/\D/g, '');
  if (!/^\+?[\d ()-]+$/.test(data.phone || '') || digits.length < 7 || digits.length > 15) {
    errors.phone = 'phone';
  }
  if (data.instagram && !/^(?:@?[a-zA-Z0-9_.]{1,30}|https:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]{1,30}\/?)$/.test(data.instagram)) {
    errors.instagram = 'instagram';
  }
  if (data.website) errors.website = 'invalid';
  return { valid: Object.keys(errors).length === 0, errors, data };
}
