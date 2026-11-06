import { describe, it, expect } from 'vitest';
import {
  normalizeRoll, validateRoll, validateDisplayName, normalizeDisplayName,
  validateEmail, validatePassword, cleanText, isValidRole, LIMITS,
} from '../../src/lib/validation.js';
import { authErrorMessage, isPermissionDenied, dbErrorMessage } from '../../src/lib/errors.js';
import { readFirebaseConfig } from '../../src/lib/config.js';

describe('roll numbers', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeRoll('  21cs 045 ')).toBe('21CS045');
  });
  it('accepts valid and rejects path-injection / bad characters', () => {
    expect(validateRoll('21CS-045')).toBeNull();
    expect(validateRoll('')).toMatch(/Enter/);
    expect(validateRoll('ab')).toMatch(/3–20/);
    for (const bad of ['a/b/c', 'x.y.z', "x');alert(1)//", '$abc', '#abc', '[abc]', 'A'.repeat(21)]) {
      expect(validateRoll(bad), bad).not.toBeNull();
    }
  });
});

describe('display names', () => {
  it('collapses whitespace and enforces length', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(validateDisplayName('Ada')).toBeNull();
    expect(validateDisplayName('   ')).toMatch(/Enter/);
    expect(validateDisplayName('x'.repeat(LIMITS.displayNameMax + 1))).toMatch(/at most/);
  });
  it('rejects angle brackets and control chars', () => {
    expect(validateDisplayName('<img src=x>')).not.toBeNull();
    expect(validateDisplayName('a\u0007b')).not.toBeNull();
  });
});

describe('email and password', () => {
  it('validates email shape', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('nope')).not.toBeNull();
    expect(validateEmail('')).not.toBeNull();
  });
  it('enforces password length and confirmation', () => {
    expect(validatePassword('short')).toMatch(/at least 8/);
    expect(validatePassword('longenough', 'different')).toMatch(/do not match/);
    expect(validatePassword('longenough', 'longenough')).toBeNull();
    expect(validatePassword('x'.repeat(129))).toMatch(/at most/);
  });
});

describe('cleanText', () => {
  it('trims, rejects empty and too long', () => {
    expect(cleanText('  hi  ', 10)).toEqual({ value: 'hi', error: null });
    expect(cleanText('   ', 10).error).toMatch(/Write something/);
    expect(cleanText('x'.repeat(11), 10).error).toMatch(/Too long/);
  });
});

describe('roles', () => {
  it('only accepts known roles', () => {
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('superuser')).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });
});

describe('error messages', () => {
  it('does not reveal whether an account exists', () => {
    const a = authErrorMessage({ code: 'auth/user-not-found' });
    const b = authErrorMessage({ code: 'auth/wrong-password' });
    const c = authErrorMessage({ code: 'auth/invalid-credential' });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it('falls back for unknown codes', () => {
    expect(authErrorMessage({ code: 'auth/whatever' })).toMatch(/Something went wrong/);
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
  });
  it('detects permission denied', () => {
    expect(isPermissionDenied({ message: 'PERMISSION_DENIED: Permission denied' })).toBe(true);
    expect(isPermissionDenied({ code: 'other' })).toBe(false);
    expect(dbErrorMessage({ message: 'PERMISSION_DENIED' }, { denied: 'X' })).toBe('X');
  });
});

describe('firebase config', () => {
  it('reports missing keys when not using emulators', () => {
    const r = readFirebaseConfig({});
    expect(r.missing).toContain('VITE_FIREBASE_API_KEY');
    expect(r.useEmulators).toBe(false);
  });
  it('fills demo values in emulator mode', () => {
    const r = readFirebaseConfig({ VITE_USE_EMULATORS: 'true' });
    expect(r.missing).toEqual([]);
    expect(r.config.projectId).toBe('demo-desk-lamp');
  });
  it('uses provided values', () => {
    const r = readFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'd', VITE_FIREBASE_DATABASE_URL: 'u', VITE_FIREBASE_PROJECT_ID: 'p',
    });
    expect(r.missing).toEqual([]);
    expect(r.config).toMatchObject({ apiKey: 'k', projectId: 'p' });
  });
});
