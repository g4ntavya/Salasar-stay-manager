// Grants (or changes) app access for a login.
//
//   npm run firebase:user -- --email owner@example.com --role ADMIN --name "Owner Name"
//   npm run firebase:user -- --email desk@example.com --role STAFF --password '<a long password>'
//   npm run firebase:user -- --email desk@example.com --revoke
//   npm run firebase:user -- --list
//
// Roles: ADMIN (everything), STAFF (bookings, guests, rooms, reports), GROWTH (analytics only).
// --password creates the login if it does not exist yet (or resets its password).

import { auth, db, parseArgs, fail, done } from './admin.mjs';

const ROLES = ['ADMIN', 'STAFF', 'GROWTH'];
const args = parseArgs();

if (args.list) {
  const users = (await db.ref('users').get()).val() || {};
  const rows = Object.entries(users).map(([uid, u]) => ({ uid, email: u.email, name: u.name, role: u.role }));
  console.table(rows);
  await done();
}

const email = String(args.email || '').trim().toLowerCase();
if (!email) fail('Pass --email');

let user = await auth.getUserByEmail(email).catch(() => null);

if (args.revoke) {
  if (!user) fail(`No login exists for ${email}`);
  await db.ref(`users/${user.uid}`).remove();
  await auth.revokeRefreshTokens(user.uid);
  console.log(`✔ Access revoked for ${email}. Their app signs out on next launch.`);
  await done();
}

const role = String(args.role || '').toUpperCase();
if (!ROLES.includes(role)) fail(`Pass --role ${ROLES.join('|')}`);

if (args.password && String(args.password).length < 8) fail('Use a password of at least 8 characters.');

if (!user) {
  if (!args.password) fail(`No login exists for ${email}. Pass --password to create it.`);
  user = await auth.createUser({ email, password: String(args.password), displayName: args.name || undefined });
  console.log(`✔ Created login ${email}`);
} else if (args.password) {
  await auth.updateUser(user.uid, { password: String(args.password) });
  console.log(`✔ Password reset for ${email}`);
}

const name = String(args.name || user.displayName || email.split('@')[0]);
await db.ref(`users/${user.uid}`).set({ email, name, role, updatedAt: Date.now() });
console.log(`✔ ${email} → ${role} (${name})`);
await done();
