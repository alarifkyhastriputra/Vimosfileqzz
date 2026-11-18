
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  indexedDBLocalPersistence, 
  browserSessionPersistence, 
  browserPopupRedirectResolver,
  getAuth 
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: "AIzaSyABUhYqmJXo16n13cAClbSQInkFWzTjl-A",
  authDomain: "vimos-1ccb7.firebaseapp.com",
  databaseURL: "https://vimos-1ccb7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vimos-1ccb7",
  storageBucket: "vimos-1ccb7.firebasestorage.app",
  messagingSenderId: "601032053838",
  appId: "1:601032053838:web:bc688de00cfa1e28d21f1f"
};

// Initialize Firebase
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export { browserPopupRedirectResolver };
export const db = getDatabase(app);

// Initialize Firebase Analytics if supported in the browser environment
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch {
        // Ignore if measurementId is not configured
      }
    }
  }).catch(() => {
    // Graceful fallback if analytics is blocked or unsupported in context
  });
}


