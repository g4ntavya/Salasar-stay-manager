# Firebase setup

Run the commands from the `frontend/` folder. The scripts use `frontend/.env` and `frontend/serviceAccountKey.json`. The key is git-ignored and gives full control of the project, so never share it or put it in the app. Every script checks that the key and `.env` point to the same project before writing anything.

## Already done

- The Realtime Database is in Singapore. Its security rules and indexes are published with `npm run firebase:rules`.
- All 49 rooms are created with `npm run firebase:rooms`. Re-running it only adds rooms that are missing.

## Staff logins

Authentication → Sign-in method → **Email/Password** must be enabled.

```sh
npm run firebase:user -- --email you@example.com --role ADMIN --name "Your Name" --password 'Long#Password1'
npm run firebase:user -- --email desk@example.com --role STAFF --name "Front Desk" --password 'Another#Pass2'
npm run firebase:user -- --list
npm run firebase:user -- --email desk@example.com --revoke     # removes access, signs them out
```

What each role can do:

- **ADMIN:** everything.
- **STAFF:** bookings, guests, rooms and reports.
- **GROWTH:** analytics only.

A login with no role can't use the app.

## EAS builds

Git ignores `.env`, so EAS builds don't see it. The app refuses to start without the config, so a build can never silently talk to the wrong project. Push the values to EAS once, and again whenever `.env` changes:

```sh
npx eas-cli login
for env in production preview development; do
  grep '^EXPO_PUBLIC_' .env | while IFS='=' read -r name value; do
    [ -n "$value" ] && npx eas-cli env:create --non-interactive --environment "$env" \
      --name "$name" --value "$value" --visibility plaintext --force
  done
done
npx eas-cli env:list --environment production
```

Then build with `npx eas-cli build -p android --profile preview` (APK) or `--profile production`.

## Everyday tasks

- **"What's New" entry:**
  ```sh
  npm run firebase:changelog -- --version 1.1.0 --title "..." --description "..."
  ```
- **Usage:** Realtime Database → Usage tab. The Spark plan allows 10 GB of downloads a month and 1 GB of storage. It never bills; it pauses if you go over a limit.
- **Revenue looks off:** as an admin, go to Profile → **Sync Analytics Data** to rebuild the stats from all bookings.
- **A room is stuck as occupied:** as an admin, tap **Repair Room Status** on the dashboard.
