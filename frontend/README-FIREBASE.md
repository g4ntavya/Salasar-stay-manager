How to enable real Email/Password auth and create a user

1. Enable Email/Password authentication in Firebase Console
   - Open Firebase Console → Authentication → Sign-in method
   - Enable Email/Password and Save

2. Create an admin user (two options):

Option A — Firebase Console (manual):
   - In Firebase Console → Authentication → Users → Add user
   - Enter email (admin@salasar.com) and password (admin123) or your own credentials

Option B — Use the helper script (recommended for automation):
   - Download a service account JSON from Firebase Console → Project Settings → Service accounts → Generate new private key
   - Save it to `frontend/serviceAccountKey.json` or set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the key path.
   - Run:
     ```
     node frontend/scripts/create_firebase_user.js --email admin@salasar.com --password admin123 --displayName "Admin"
     ```

3. Verify in Firebase Console → Authentication that the user exists.

4. Restart the frontend dev server and sign in with the created credentials.

Notes:
- The helper script uses the Admin SDK and must be run from a machine you control (do not commit service account keys to source control).
- After creating the user, you can sign in through the app UI using the email/password.
