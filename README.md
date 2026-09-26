# Salasar Stay Manager

An Android app for running the Salasar guest house: check guests in, manage rooms, check them out, and track revenue.

It's an Expo (React Native) app built on Firebase's free Spark plan. ID photos and a readable guest archive live on a small self-hosted server.

## Features

- **Dashboard:** a live room grid showing occupied and free rooms, including rooms with advance bookings.
- **New booking:**
  - guest details and ID photos (camera or gallery)
  - several rooms for one stay
  - advance bookings with a token amount
- **Bookings:**
  - search and filter by month
  - check out a stay in one tap
  - export to CSV
- **Booking details:** extend a stay, move a stay to other rooms, or confirm an advance check-in.
- **Guests:** search every guest ever recorded (by name, mobile or vehicle), and view or edit a guest's details.
- **Revenue:**
  - analytics with month-on-month and year-on-year growth, filtered by Cash or UPI
  - date-range reports with CSV export
- **Roles:** each login is ADMIN, STAFF or GROWTH (see below).

### Entering amounts

The amount field is free text. Each number is one payment, and an optional suffix says how it was paid:

| Entered | Read as |
|---|---|
| `1500` | ₹1,500, using the Cash/UPI toggle on the form |
| `1000p, 500c` | ₹1,500 = ₹1,000 UPI + ₹500 cash |
| `₹1,200 upi + 300 cash` | ₹1,500 = ₹1,200 UPI + ₹300 cash |

The suffixes are:

- **UPI:** `p`, `u`, `upi`, `g`, `gpay`, `phonepe`, `paytm`, `online`
- **Cash:** `c`, `cash`

`1,500` is read as one thousand five hundred. The parser is in `frontend/src/utils/amount.ts`.

## How it fits together

```
 Android app (Expo)
   ├── Firebase Auth ─────────── staff logins
   ├── Firebase Realtime DB ──── rooms, guests, bookings, revenue stats, roles
   └── Media server (HTTPS) ──── ID photo upload/view (login token required)
                    │
                    └── mirrors guests from the database into a folder-per-guest
                        archive with an admin web page
```

- **Queries:** every screen uses indexed database queries, so usage stays inside the free Spark plan.
- **Revenue totals** are updated once per stay at checkout, so Analytics reads a few small records instead of every booking.
- **ID photos** are compressed on the phone and kept there until they upload. If there's no internet, they wait and upload automatically later.
- **Security rules** (`frontend/database.rules.json`) decide who can read or write what. The Firebase web keys in the app aren't secret; the rules are what protect the data.

## Repository layout

| Path | What it is |
|---|---|
| `frontend/` | The Expo app (screens in `app/`, data layer in `src/`) |
| `frontend/database.rules.json` | Realtime Database security rules and indexes |
| `frontend/scripts/firebase/` | Admin scripts: rules, rooms, users, config, changelog |
| `frontend/FIREBASE_SETUP.md` | Firebase setup and everyday admin tasks |
| `media-server/` | Node.js photo server and guest archive; see [its README](media-server/README.md) |
| `backend/`, `tests/`, `scripts/`, root `*.md` reports | Legacy files from earlier versions, not used by the app |

## Getting started

Requirements: Node.js 20+ and an Android phone with Expo Go, or an emulator.

```sh
cd frontend
cp .env.example .env        # fill in your Firebase web app config (see FIREBASE_SETUP.md)
npm install
npx expo start -c
```

The app refuses to start if the Firebase config is missing, so it can never quietly connect to the wrong project.

### Setting up a Firebase project

This needs `frontend/serviceAccountKey.json` from Firebase console → Project settings → Service accounts. The file is git-ignored.

```sh
cd frontend
npm run firebase:rules                     # publish security rules + indexes
npm run firebase:rooms                     # create the room list
npm run firebase:user -- --email you@example.com --password '…' --role ADMIN --name "Your Name"
npm run firebase:config -- --media-url https://your-media-server   # where ID photos go
```

`FIREBASE_SETUP.md` covers the rest: revoking access, "What's New" entries, and usage limits.

### Roles

| Role | Can use |
|---|---|
| ADMIN | Everything, including repair tools and the archive web page |
| STAFF | Bookings, guests, rooms, reports |
| GROWTH | Analytics only |

A login without a role can't use the app.

## Building the APK

Builds run on EAS. The Firebase and media-server settings are stored as EAS environment variables, because `.env` isn't uploaded with the build:

```sh
cd frontend
npx eas-cli build -p android --profile preview      # installable APK
npx eas-cli build -p android --profile production   # Play Store bundle
```

Before a release, raise `expo.android.versionCode` in `app.json`.

## Secrets and personal data

Git ignores all of the following. Keep it that way:

- `.env` files
- Firebase service-account keys
- the Android keystore (`*.jks`)
- the media server's `deploy/salasar.env`
- all guest data: `media-server/data/` and migration exports

The media server's archive holds guest names, phone numbers and ID documents, so back it up somewhere private.
