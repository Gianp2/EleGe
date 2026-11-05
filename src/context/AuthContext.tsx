import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig, isFirebaseConfigured, missingFirebaseKeys } from '../firebase/config';
import { isAuthorizedAdminUid, getAuthErrorMessage, DEFAULT_ADMIN_EMAIL } from '../firebase/adminConfig';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAuthorized: boolean;
  authError: string | null;
  isFirebaseConfigured: boolean;
  missingKeys: string[];
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Fail closed: no se autorizan sesiones simuladas ni modo de previsualización.
    if (!isFirebaseConfigured) {
      setCurrentUser(null);
      setIsAuthorized(false);
      setAuthError('Firebase no está configurado. Contactá al administrador.');
      setLoading(false);
      return;
    }

    // Escucha cambios de estado de autenticación en Firebase
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        try {
          if (user) {
            if (isAuthorizedAdminUid(user.uid)) {
              setCurrentUser(user);
              setIsAuthorized(true);
              setAuthError(null);
            } else {
              // Usuario autenticado pero sin UID autorizado de administradora
              await signOut(auth);
              setCurrentUser(null);
              setIsAuthorized(false);
              setAuthError('Acceso denegado: este usuario no tiene permisos de administradora en Lavadero eLeGe.');
            }
          } else {
            setCurrentUser(null);
            setIsAuthorized(false);
          }
        } catch (err: unknown) {
          console.warn('Error verificando estado de sesión:', err);
          setCurrentUser(null);
          setIsAuthorized(false);
        } finally {
          setLoading(false);
        }
      });

      return () => unsubscribe();
    } catch (err) {
      console.warn('Error al suscribir onAuthStateChanged:', err);
      setLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setLoading(true);
    setAuthError(null);

    const cleanEmail = email.trim() || DEFAULT_ADMIN_EMAIL;

    if (!isFirebaseConfigured) {
      setCurrentUser(null);
      setIsAuthorized(false);
      setAuthError('Firebase no está configurado. No se puede iniciar sesión.');
      setLoading(false);
      return false;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const user = userCredential.user;

      if (!isAuthorizedAdminUid(user.uid)) {
        console.warn('[Firebase Auth] UID no autorizado:', {
          uid: user.uid,
          email: user.email,
          authorizedUid: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
          explicacion: 'El usuario inició sesión pero su UID no coincide con el UID de administradora configurado en Lavadero eLeGe.',
          solucion: 'Verificá el UID del usuario admin@elege.com en Firebase Console > Authentication > Users.',
        });
        await signOut(auth);
        setCurrentUser(null);
        setIsAuthorized(false);
        setAuthError('Acceso denegado: este usuario no tiene permisos de administradora en Lavadero eLeGe.');
        return false;
      }

      console.info('[Firebase Auth] Autenticación exitosa como administradora:', {
        email: user.email,
        uid: user.uid,
        coincideConAdminAutorizada: true,
      });
      setCurrentUser(user);
      setIsAuthorized(true);
      setAuthError(null);

      // Comprobación 4: Lectura real y segura de Firestore para verificar reglas
      try {
        const testDocRef = doc(db, 'configuracion', 'general');
        const testSnap = await getDoc(testDocRef);
        console.info('[Firestore] Lectura de verificación completada exitosamente:', {
          path: 'configuracion/general',
          documentoExiste: testSnap.exists(),
          uidAutenticado: user.uid,
          reglasFirestore: 'Permitida por firestore.rules para UID eBvTLPVNQIefDTc52fmcmK0ID0K3',
        });
      } catch (firestoreErr: unknown) {
        const fsError = firestoreErr as { code?: string; message?: string };
        const fsCode = fsError?.code || 'unknown';
        console.warn('[Firestore] Aviso en lectura de verificación:', {
          codigo: fsCode,
          mensaje: fsError?.message || String(firestoreErr),
          uid: user.uid,
          path: 'configuracion/general',
          diagnostico: fsCode === 'permission-denied'
            ? 'Reglas de seguridad denegaron la lectura. Verificá que las reglas publicadas tengan el UID eBvTLPVNQIefDTc52fmcmK0ID0K3.'
            : 'Error de red o comunicación con los servidores de Cloud Firestore.',
          solucion: fsCode === 'permission-denied'
            ? 'Revisá la consola de Firestore en https://console.firebase.google.com/project/elege-99d0c/firestore/rules'
            : 'Comprobá el estado de la conexión a internet.',
        });
      }

      return true;
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      const errorCode = errorObj?.code || '';
      const errorMessage = errorObj?.message || String(err);

      console.warn('[Firebase Auth] Diagnóstico técnico de autenticación:', {
        codigoError: errorCode,
        mensajeTecnico: errorMessage,
        email: cleanEmail,
        currentHost: typeof window !== 'undefined' ? window.location.host : 'unknown',
      });

      // Diagnóstico detallado con instrucciones paso a paso para la consola de desarrollo
      if (errorCode === 'auth/invalid-api-key' || errorCode === 'auth/api-key-not-valid') {
        console.warn(
          '[Firebase Diagnóstico] La API Key configurada no es válida o fue rechazada por Google.\n' +
          'Cómo resolverlo:\n' +
          '1. Abrí Firebase Console: https://console.firebase.google.com/project/elege-99d0c/settings/general\n' +
          '2. En "Tus apps" > "SDK de configuración Web", copiá el valor exacto de "apiKey".\n' +
          '3. Cargalo en el archivo .env o .env.local como: VITE_FIREBASE_API_KEY="AIzaSy..." o ejecutá configurarFirebaseApiKey("AIzaSy...") en consola.'
        );
      } else if (errorCode === 'auth/unauthorized-domain') {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
        console.warn(
          `[Firebase Diagnóstico] El dominio actual ("${hostname}") no está en los dominios autorizados de Firebase.\n` +
          'Cómo resolverlo:\n' +
          '1. Abrí Firebase Console: https://console.firebase.google.com/project/elege-99d0c/authentication/settings\n' +
          '2. En la pestaña "Configuración", buscá la sección "Dominios autorizados".\n' +
          '3. Hacé clic en "Agregar dominio" y pegá exactamente: ' + hostname + '\n' +
          '4. Guardá los cambios y volvé a intentar iniciar sesión.'
        );
      } else if (errorCode === 'auth/operation-not-allowed') {
        console.warn(
          '[Firebase Diagnóstico] El método de inicio de sesión con Correo/Contraseña está inactivo.\n' +
          'Cómo resolverlo:\n' +
          '1. Abrí Firebase Console: https://console.firebase.google.com/project/elege-99d0c/authentication/providers\n' +
          '2. En "Proveedores de acceso", hacé clic en "Correo electrónico/contraseña".\n' +
          '3. Activá la casilla "Habilitar" y guardá.'
        );
      } else if (
        errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/wrong-password' ||
        errorCode === 'auth/invalid-credential'
      ) {
        console.warn(
          '[Firebase Diagnóstico] Las credenciales no coinciden con un usuario registrado en Firebase Auth.\n' +
          'Cómo resolverlo:\n' +
          '1. Abrí Firebase Console: https://console.firebase.google.com/project/elege-99d0c/authentication/users\n' +
          '2. Verificá si el usuario admin@elege.com ya está creado con UID eBvTLPVNQIefDTc52fmcmK0ID0K3.\n' +
          '3. Si no existe, hacé clic en "Agregar usuario", colocá admin@elege.com y definí su contraseña de administradora.'
        );
      } else if (errorCode === 'auth/network-request-failed') {
        console.warn(
          '[Firebase Diagnóstico] No se pudo establecer conexión de red con los servidores de Google Identity.\n' +
          'Verificá tu conexión a internet o posibles bloqueadores de anuncios (adblockers) en el navegador.'
        );
      }

      const friendlyMessage = getAuthErrorMessage(errorCode);
      setAuthError(friendlyMessage);
      setCurrentUser(null);
      setIsAuthorized(false);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setLoading(true);
      try {
        sessionStorage.removeItem('elege_preview_admin_session');
      } catch {}
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Error al cerrar sesión:', err);
    } finally {
      setCurrentUser(null);
      setIsAuthorized(false);
      setAuthError(null);
      setLoading(false);
    }
  };

  const clearError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        isAuthorized,
        authError,
        isFirebaseConfigured,
        missingKeys: missingFirebaseKeys,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
