# Firebase Setup Guide for Salasar Stay Manager

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name your project: "Salasar Stay Manager"
4. Disable Google Analytics (optional for this project)
5. Click "Create project"

## Step 2: Register Your App

1. In your Firebase project, click the "Web" icon (</>) to add a web app
2. Name your app: "Salasar Stay Manager"
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"
5. Copy the Firebase configuration object

## Step 3: Enable Authentication

1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Click on "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

## Step 4: Create Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Select "Start in test mode" (for development)
4. Choose your preferred location
5. Click "Enable"

## Step 5: Configure Firebase in Your App

1. Open `/app/frontend/src/firebase/config.ts`
2. Replace the placeholder values with your Firebase configuration:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 6: Set Up Firestore Security Rules (Production)

For production, update Firestore rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Profiles collection - only authenticated users can read their own profile
    match /profiles/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Rooms - all authenticated users can read, only admins can write
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.role == 'ADMIN';
    }
    
    // Customers - all authenticated users can read and write
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    // Bookings - all authenticated users can read, staff can create, admins can delete
    match /bookings/{bookingId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null && 
        get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.role == 'ADMIN';
    }
    
    // Messages - all authenticated users can access
    match /messages/{messageId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 7: Create Initial Admin User

1. In Firebase Console, go to "Authentication"
2. Click "Add user"
3. Email: `admin@salasar.com`
4. Password: `admin123`
5. Click "Add user"
6. Copy the User UID
7. Go to "Firestore Database"
8. Create a new collection called `profiles`
9. Add a document with the User UID as document ID:
   ```json
   {
     "id": "<USER_UID>",
     "full_name": "Admin User",
     "role": "ADMIN",
     "email": "admin@salasar.com"
   }
   ```

## Step 8: Create Test Staff User (Optional)

1. In Firebase Console, go to "Authentication"
2. Click "Add user"
3. Email: `staff@salasar.com`
4. Password: `staff123`
5. In Firestore, add a profile document:
   ```json
   {
     "id": "<USER_UID>",
     "full_name": "Staff User",
     "role": "STAFF",
     "email": "staff@salasar.com"
   }
   ```

## Step 9: Test Your Configuration

1. Save your Firebase config in `/app/frontend/src/firebase/config.ts`
2. Restart your Expo development server
3. Try logging in with the credentials you created

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check that your API key is correct in `config.ts`

### "Missing or insufficient permissions"
- Make sure you're in "Test mode" for development
- Check that the user has a profile document in Firestore

### "Cannot find user profile"
- Ensure you created a profile document in Firestore with the correct User UID
- The document ID must match the Authentication UID

## Next Steps

Once Firebase is configured:
1. Login with your admin credentials
2. Create some test rooms
3. Add test bookings
4. Test the complete workflow
