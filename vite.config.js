import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets are required when the packaged Electron app loads index.html
// directly from disk instead of through the Vite development server.
export default defineConfig({
  base: './',
  server: {proxy: {'/api': {target:process.env.WENDAFLOW_DEV_PROXY_TARGET||'http://127.0.0.1:4318',changeOrigin:false,rewrite:p=>p.replace(/^\/api/,'')}}},
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'markdown-vendor', test: /node_modules[\\/](react-markdown|remark-|rehype-|unified|unist-|mdast-|hast-|micromark|vfile|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities|bail|trough|is-plain-obj|devlop|ccount|escape-string-regexp|markdown-table|longest-streak|trim-lines)/, priority: 20 },
            { name: 'i18n-pack', test: /src[\\/]i18n[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  plugins: [react()],
});
