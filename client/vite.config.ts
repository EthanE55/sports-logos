import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8788',
    },
    // Allow Cloudflare quick-tunnel hosts (random subdomains on
    // trycloudflare.com) so the dev server is reachable through the
    // public URL during sharing. Add other host patterns here if you
    // tunnel through a different service.
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
});
