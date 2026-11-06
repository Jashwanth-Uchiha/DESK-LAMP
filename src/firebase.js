import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { readFirebaseConfig } from './lib/config.js';

const { config, useEmulators, missing } = readFirebaseConfig(import.meta.env);

export const configError = missing.length
  ? `Missing Firebase settings: ${missing.join(', ')}. Copy .env.example to .env.local and fill in your project's web config, or set VITE_USE_EMULATORS=true for local development.`
  : null;

export let app = null;
export let auth = null;
export let db = null;
export const usingEmulators = useEmulators;

if (!configError) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getDatabase(app);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
}
