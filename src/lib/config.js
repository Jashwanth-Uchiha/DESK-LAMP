// Reads Firebase web config from Vite env vars (VITE_*). Pure function so it can be unit tested.

const KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};
const REQUIRED = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];

export const DEMO_PROJECT_ID = 'demo-desk-lamp';

export function readFirebaseConfig(env) {
  const useEmulators = String(env.VITE_USE_EMULATORS || '').toLowerCase() === 'true';
  const config = {};
  for (const [field, key] of Object.entries(KEYS)) {
    const v = (env[key] || '').trim();
    if (v) config[field] = v;
  }
  if (useEmulators) {
    // "demo-" project IDs never touch real Firebase services.
    config.projectId ||= DEMO_PROJECT_ID;
    config.apiKey ||= 'demo-api-key';
    config.authDomain ||= `${config.projectId}.firebaseapp.com`;
    config.databaseURL ||= `https://${config.projectId}-default-rtdb.firebaseio.com`;
  }
  const missing = REQUIRED.filter((f) => !config[f]).map((f) => KEYS[f]);
  return { config, useEmulators, missing };
}
