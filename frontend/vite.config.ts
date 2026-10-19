import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build lands in ../app/static, which FastAPI serves, so the Python
// package ships a ready-to-run dashboard and Node is only needed to *change* the UI.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../app/static', emptyOutDir: true, sourcemap: false },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'node' },
});
