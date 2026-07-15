import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base:'./' so the built dist/index.html can also be loaded directly by Electron via file://
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
});
