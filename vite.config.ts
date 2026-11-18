import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * La configurazione Firebase NON è nel repository.
 * - In locale: file `firebase-applet-config.json` nella root (ignorato da git).
 * - Su GitHub Actions: secret `FIREBASE_CONFIG` con lo stesso JSON.
 */
function loadFirebaseConfig(mode: string): Record<string, string> {
  const fromEnv = process.env.FIREBASE_CONFIG || loadEnv(mode, process.cwd(), '').FIREBASE_CONFIG;
  const file = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fromEnv || (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (!raw) {
    throw new Error(
      'Configurazione Firebase mancante: crea firebase-applet-config.json oppure imposta la variabile FIREBASE_CONFIG.',
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_CONFIG non contiene un JSON valido.');
  }
}

// Pubblicato su GitHub Pages all'indirizzo https://bottaridennis.github.io/famtree/
export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? '/famtree/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(loadFirebaseConfig(mode)),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          vendor: ['react', 'react-dom', 'motion/react', 'd3'],
        },
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
}));
