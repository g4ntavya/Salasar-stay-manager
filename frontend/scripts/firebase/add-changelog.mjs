// Adds a "What's New" entry shown to staff after an update.
//
//   npm run firebase:changelog -- --version 1.1.0 --title "Faster app" --description "Split payments like 1000p, 500c now add up correctly."

import { db, parseArgs, fail, done } from './admin.mjs';

const { version, title, description } = parseArgs();
if (!version || !title) fail('Pass --version and --title (and optionally --description)');

const ref = db.ref('changelog').push();
await ref.set({ version: String(version), title: String(title), description: String(description || ''), createdAt: Date.now() });
console.log(`✔ Changelog entry ${ref.key} added`);
await done();
