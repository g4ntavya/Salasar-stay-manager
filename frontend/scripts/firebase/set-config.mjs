// Sets app-wide settings the app reads at runtime (no rebuild needed).
//
//   npm run firebase:config -- --media-url https://media.example.com
//   npm run firebase:config            (shows current settings)

import { db, parseArgs, fail, done } from './admin.mjs';

const args = parseArgs();
if (args['media-url']) {
  const url = String(args['media-url']).trim().replace(/\/+$/, '');
  if (!url.startsWith('https://')) fail('The media server URL must start with https:// (Android blocks plain http).');
  await db.ref('config/mediaUrl').set(url);
  console.log(`✔ Media server set to ${url}. Phones pick it up on next sign-in or within an hour.`);
}
console.log('Current config:', (await db.ref('config').get()).val() || {});
await done();
