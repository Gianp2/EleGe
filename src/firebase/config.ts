/**
 * Configuración de Firebase para Lavadero eLeGe
 * Proyecto oficial: elege-99d0c
 * UID Administradora Autorizada: eBvTLPVNQIefDTc52fmcmK0ID0K3
 *
 * Mejoras aplicadas:
 * 1. Detección exhaustiva de variables de entorno disponibles vía import.meta.env o process.env.
 * 2. Cero inicialización con placeholders o valores inventados (evita peticiones con claves inválidas).
 * 3. Notificación exacta de variables faltantes para guiar al usuario.
 * 4. Proxies seguros que previenen errores en tiempo de importación cuando la API Key aún no fue cargada.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
  config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

/**
 * Inspecciona las variables de entorno y configuración en tiempo de ejecución
 * para determinar si Firebase cuenta con las credenciales requeridas
 * para operar contra el proyecto elege-99d0c.
 */
export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  // Soporte para variables inyectadas en tiempo de ejecución o cargadas por Vite
  const runtimeConfig = (typeof window !== 'undefined' && (window as any).__FIREBASE_CONFIG__) || {};

  const localStoredKey = (typeof window !== 'undefined' && localStorage.getItem('elege_firebase_api_key')) || '';

  const apiKey = (
    runtimeConfig.apiKey ||
    import.meta.env.VITE_FIREBASE_API_KEY ||
    localStoredKey ||
    ''
  ).trim();

  const authDomain = (
    runtimeConfig.authDomain ||
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'elege-99d0c.firebaseapp.com'
  ).trim();

  const projectId = (
    runtimeConfig.projectId ||
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    'elege-99d0c'
  ).trim();

  const storageBucket = (
    runtimeConfig.storageBucket ||
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'elege-99d0c.firebasestorage.app'
  ).trim();

  const messagingSenderId = (
    runtimeConfig.messagingSenderId ||
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    ''
  ).trim();

  const appId = (
    runtimeConfig.appId ||
    import.meta.env.VITE_FIREBASE_APP_ID ||
    ''
  ).trim();

  const missingKeys: string[] = [];

  // 1. Validar API Key obligatoria (no debe estar vacía ni ser un placeholder)
  if (
    !apiKey ||
    apiKey === '' ||
    apiKey === 'TU_API_KEY' ||
    apiKey.toLowerCase().includes('placeholder')
  ) {
    missingKeys.push('VITE_FIREBASE_API_KEY');
  }

  // 2. Validar Project ID
  if (
    !projectId ||
    projectId === '' ||
    projectId === 'tu-proyecto-id' ||
    projectId.toLowerCase().includes('placeholder')
  ) {
    missingKeys.push('VITE_FIREBASE_PROJECT_ID');
  }

  // Nota: appId y messagingSenderId son opcionales para Firebase Auth y Firestore.
  // No bloquean isConfigured si no están presentes, permitiendo que la autenticación opere normalmente.

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    config: {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
    },
  };
}

const status = getFirebaseConfigStatus();
export const firebaseConfig = status.config;
export const isFirebaseConfigured = status.isConfigured;
export const missingFirebaseKeys = status.missingKeys;

// Inicialización controlada: NUNCA inicializar con placeholders o claves falsas
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    console.info('[Firebase] SDK inicializado correctamente para el proyecto:', firebaseConfig.projectId);
  } catch (err) {
    console.error('[Firebase] Error al inicializar SDK con la configuración provista:', err);
  }
} else {
  console.info('[Firebase] Modo sin credenciales remotas activas:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    missingKeys: missingFirebaseKeys,
  });
}


// Proxies seguros: si la configuración no está lista, previenen llamadas de red con credenciales inválidas
export const app: FirebaseApp = new Proxy({} as FirebaseApp, {
  get(_, prop) {
    if (!appInstance) {
      if (isFirebaseConfigured) {
        appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        return (appInstance as any)[prop];
      }
      throw new Error(
        `Firebase no está inicializado: faltan variables requeridas [${missingFirebaseKeys.join(', ')}]. Cargalas en .env.local o .env.`
      );
    }
    return (appInstance as any)[prop];
  },
});

export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!authInstance) {
      if (isFirebaseConfigured) {
        if (!appInstance) appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        authInstance = getAuth(appInstance);
        return (authInstance as any)[prop];
      }
      if (prop === 'currentUser') return null;
      throw new Error(
        `Firebase Authentication no está disponible: faltan variables requeridas [${missingFirebaseKeys.join(', ')}].`
      );
    }
    return (authInstance as any)[prop];
  },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!dbInstance) {
      if (isFirebaseConfigured) {
        if (!appInstance) appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        dbInstance = getFirestore(appInstance);
        return (dbInstance as any)[prop];
      }
      throw new Error(
        `Cloud Firestore no está disponible: faltan variables requeridas [${missingFirebaseKeys.join(', ')}].`
      );
    }
    return (dbInstance as any)[prop];
  },
});

// Helpers accesibles desde la consola del navegador para activar o desactivar la API Key en caliente
if (typeof window !== 'undefined') {
  (window as any).configurarFirebaseApiKey = (key: string) => {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      console.warn('[Firebase] Clave vacía. Por favor pasá una API Key válida.');
      return;
    }
    localStorage.setItem('elege_firebase_api_key', key.trim());
    console.info('[Firebase] API Key guardada correctamente. Recargando la aplicación...');
    window.location.reload();
  };

  (window as any).eliminarFirebaseApiKey = () => {
    localStorage.removeItem('elege_firebase_api_key');
    console.info('[Firebase] API Key eliminada. Recargando la aplicación en modo previsualización...');
    window.location.reload();
  };
}
