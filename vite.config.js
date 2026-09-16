import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets are required when the packaged Electron app loads index.html
// directly from disk instead of through the Vite development server.
export default defineConfig({
  base: './',
  plugins: [react()],
});
