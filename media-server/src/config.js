// Settings come from environment variables (on the VM: /etc/salasar-media.env).
import fs from 'node:fs';
import path from 'node:path';

const loadEnvFile = file => {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
};
loadEnvFile(process.env.ENV_FILE || path.resolve('.env'));

const required = name => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required setting ${name}`);
    process.exit(1);
  }
  return value;
};

// Guest dates are Indian local days.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  publicUrl: required('PUBLIC_URL').replace(/\/+$/, ''),
  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    databaseURL: required('FIREBASE_DATABASE_URL'),
    webApiKey: required('FIREBASE_WEB_API_KEY'),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  },
  maxUploadBytes: 12 * 1024 * 1024,
  syncEnabled: process.env.SYNC_ENABLED !== 'false',
};
