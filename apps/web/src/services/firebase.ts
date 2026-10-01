import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
  emulators: boolean;
}

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

function config() {
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };
  }
  if (useEmulators) {
    return {
      apiKey: 'demo-key',
      authDomain: 'demo-drivemart.firebaseapp.com',
      projectId: 'demo-drivemart',
      storageBucket: 'demo-drivemart.appspot.com',
      appId: 'demo-app',
    };
  }
  return null;
}

let services: FirebaseServices | null | undefined;

/** Serviços do Firebase, ou nulo quando o projeto não está configurado (modo só de direção). */
export function firebase(): FirebaseServices | null {
  if (services !== undefined) return services;
  const cfg = config();
  if (!cfg) {
    services = null;
    return null;
  }
  const app = initializeApp(cfg);
  if (env.VITE_RECAPTCHA_SITE_KEY && !useEmulators) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = getAuth(app);
  auth.languageCode = 'pt-BR';
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, 'southamerica-east1');
  if (useEmulators) {
    const host = window.location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
    connectFunctionsEmulator(functions, host, 5001);
  }
  services = { app, auth, db, storage, functions, emulators: useEmulators };
  return services;
}
