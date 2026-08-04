import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Production behind boothbuzz.in/admin/ → set VITE_BASE=/admin/ at build time.
    // Local Vite / docker on :8081 alone → leave unset (defaults to "/").
    base: env.VITE_BASE || process.env.VITE_BASE || '/',
    define: {
      'process.env': Object.fromEntries(
        Object.entries(env).map(([key, val]) => [key, JSON.stringify(val)])
      ),
    },
    plugins: [react()],
    envPrefix: 'VITE_',
  };
});
