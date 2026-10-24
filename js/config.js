// Nap Log configuration: Firebase project, app version and the public push key.

// Paste your Firebase web config here to enable sharing between phones.
// Leave as null to run in local-only mode (data stays on this phone).
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4',
  authDomain: 'nap-log-78cb6.firebaseapp.com',
  projectId: 'nap-log-78cb6',
  storageBucket: 'nap-log-78cb6.firebasestorage.app',
  messagingSenderId: '711794498566',
  appId: '1:711794498566:web:194b83d05cb55eaf0c3787',
};

// Public key for web push (the matching private key lives only in the GitHub secret VAPID_PRIVATE_KEY)
// App version: shown next to the title and must match the cache name in sw.js
const VER = '3.14';
const VAPID_PUBLIC = 'BFiW5XF3dmk6tzUYTLA4dJeelx0_F-OlKKiaz41CSTytp5ro8gCZUZZt6vnPTJGGyTIVvm7NT8v28hVJ7UVQujY';
