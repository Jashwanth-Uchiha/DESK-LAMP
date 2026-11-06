// Client-side validation. These limits MUST match database.rules.json —
// the rules are the real enforcement; this only gives friendly feedback early.

export const LIMITS = Object.freeze({
  displayNameMax: 40,
  rollMin: 3,
  rollMax: 20,
  passwordMin: 8,
  passwordMax: 128,
  chatMax: 1000,
  postMax: 4000,
  todoMax: 500,
});

export const ROLES = Object.freeze(['student', 'senior', 'counselor', 'moderator', 'admin']);

const ROLL_RE = /^[A-Z0-9-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim, uppercase and strip internal whitespace so "21cs 045" and "21CS045" match. */
export function normalizeRoll(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function validateRoll(raw) {
  const roll = normalizeRoll(raw);
  if (!roll) return 'Enter your roll number.';
  if (!ROLL_RE.test(roll)) return 'Roll number must be 3–20 letters, digits or hyphens.';
  return null;
}

export function normalizeDisplayName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function validateDisplayName(raw) {
  const name = normalizeDisplayName(raw);
  if (!name) return 'Enter a display name.';
  if (name.length > LIMITS.displayNameMax) return `Display name must be at most ${LIMITS.displayNameMax} characters.`;
  // Block control characters and angle brackets (not a security boundary — rendering
  // uses textContent — but keeps names readable and avoids confusion).
  if (/[\u0000-\u001f\u007f<>]/.test(name)) return 'Display name contains characters that are not allowed.';
  return null;
}

export function validateEmail(raw) {
  const email = String(raw ?? '').trim();
  if (!email) return 'Enter your email.';
  if (!EMAIL_RE.test(email) || email.length > 254) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(pw, confirm) {
  if (typeof pw !== 'string' || pw.length === 0) return 'Enter a password.';
  if (pw.length < LIMITS.passwordMin) return `Password must be at least ${LIMITS.passwordMin} characters.`;
  if (pw.length > LIMITS.passwordMax) return `Password must be at most ${LIMITS.passwordMax} characters.`;
  if (confirm !== undefined && pw !== confirm) return 'Passwords do not match.';
  return null;
}

/** Validate free text for chat/posts/todos. Returns {value, error}. */
export function cleanText(raw, max) {
  const value = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!value) return { value, error: 'Write something first.' };
  if (value.length > max) return { value, error: `Too long — keep it under ${max} characters.` };
  return { value, error: null };
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
