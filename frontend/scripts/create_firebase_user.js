/*
Create a Firebase Authentication user using the Admin SDK.
Usage:
  1. Place your service account JSON at frontend/serviceAccountKey.json OR set GOOGLE_APPLICATION_CREDENTIALS to the path.
  2. Run: node frontend/scripts/create_firebase_user.js --email admin@salasar.com --password admin123 --displayName "Admin"

This will create an email/password user in the Firebase project associated with the service account.
*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? null : process.argv[idx + 1];
}

async function main() {
  const email = getArg('email');
  const password = getArg('password');
  const displayName = getArg('displayName') || 'Admin';

  if (!email || !password) {
    console.error('Usage: node create_firebase_user.js --email user@example.com --password secret');
    process.exit(1);
  }

  // Try to initialize with local service account file if present
  const svcPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(svcPath)) {
    const serviceAccount = require(svcPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Rely on GOOGLE_APPLICATION_CREDENTIALS env var
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  try {
    const user = await admin.auth().createUser({
      email,
      password,
      displayName,
    });
    console.log('Created user:', user.uid, user.email);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.log('User already exists. Fetching existing user...');
      const user = await admin.auth().getUserByEmail(email);
      console.log('User:', user.uid, user.email);
    } else {
      console.error('Error creating user:', err);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
