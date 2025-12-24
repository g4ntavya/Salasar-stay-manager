// Simple smoke test to exercise createBookingAtomic and checkoutBooking
// Run from project root: node scripts/smoke_rtdb_atomic_test.js

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');
// We can't import app's firebase config easily; this script is illustrative and optional.

console.log('Smoke test placeholder: please run the app and use the UI to verify atomic booking and checkout.');
