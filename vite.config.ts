import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Exponer variables VITE_FIREBASE_* explícitamente tanto desde archivos .env como desde process.env
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(
        process.env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || ''
      ),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(
        process.env.VITE_FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || 'elege-99d0c.firebaseapp.com'
      ),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(
        process.env.VITE_FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || 'elege-99d0c'
      ),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(
        process.env.VITE_FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || 'elege-99d0c.firebasestorage.app'
      ),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(
        process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''
      ),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(
        process.env.VITE_FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || ''
      ),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
