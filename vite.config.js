import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets are required when the packaged Electron app loads index.html
// directly from disk instead of through the Vite development server.
export default defineConfig({
  base: './',
  server: {proxy: {'/api': {target:process.env.WENDAFLOW_DEV_PROXY_TARGET||'http://127.0.0.1:4318',changeOrigin:false,rewrite:p=>p.replace(/^\/api/,'')}}},
  plugins: [react()],
});
