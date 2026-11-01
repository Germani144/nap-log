// Nap Log settings for this copy of the app. In a copy (a fork), this is the only file to change: see SETUP.md.

// The address of this copy (GitHub: Settings > Pages). The Firebase and push settings below are used only there, so a
// fresh copy at another address runs on its own (data stays on each phone) until its own settings are filled in.
const APP_ADDRESS = 'https://germani144.github.io/nap-log/';

// Sharing between phones: the web config of this copy's Firebase project, or null for no sharing.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4',
  authDomain: 'nap-log-78cb6.firebaseapp.com',
  projectId: 'nap-log-78cb6',
  storageBucket: 'nap-log-78cb6.firebasestorage.app',
  messagingSenderId: '711794498566',
  appId: '1:711794498566:web:194b83d05cb55eaf0c3787',
};

// Reminders: the public push key, or null for no reminders. The matching private key lives only in the GitHub secret
// VAPID_PRIVATE_KEY.
const VAPID_PUBLIC = 'BFiW5XF3dmk6tzUYTLA4dJeelx0_F-OlKKiaz41CSTytp5ro8gCZUZZt6vnPTJGGyTIVvm7NT8v28hVJ7UVQujY';
