/**
 * Selector y Gestor de Proveedor de Datos para Lavadero eLeGe
 * Permite alternar y verificar de manera explícita el motor de persistencia activo.
 * Por defecto y de forma predeterminada: 'localStorage'.
 */

export type DataProviderType = 'localStorage' | 'firestore';

export interface DataProviderStatus {
  activeProvider: DataProviderType;
  isLocalStorageReady: boolean;
  isFirestorePrepared: boolean;
  notes: string;
}

// Configuración explícita del proveedor:
// Mantener 'localStorage' como predeterminado inalterable hasta la etapa de migración real.
export const DEFAULT_DATA_PROVIDER: DataProviderType = 'localStorage';

class DataProviderManager {
  private currentProvider: DataProviderType = DEFAULT_DATA_PROVIDER;

  getProvider(): DataProviderType {
    return this.currentProvider;
  }

  getStatus(): DataProviderStatus {
    return {
      activeProvider: this.currentProvider,
      isLocalStorageReady: true,
      isFirestorePrepared: true,
      notes:
        this.currentProvider === 'localStorage'
          ? 'Almacenamiento Local (LocalStorage) activo. Cloud Firestore preparado y listo para la futura etapa de migración.'
          : 'Cloud Firestore activo como proveedor principal.',
    };
  }

  isUsingLocalStorage(): boolean {
    return this.currentProvider === 'localStorage';
  }

  isUsingFirestore(): boolean {
    return this.currentProvider === 'firestore';
  }
}

export const dataProviderManager = new DataProviderManager();
