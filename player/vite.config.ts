import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function spaFallback() {
  return {
    name: 'spa-fallback',
    configureServer(server: { middlewares: { stack: { unshift: (m: { route: string; handle: (req: any, res: any, next: () => void) => void }) => void } } }) {
      const handler = (req: any, res: any, next: () => void) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url !== '/' && !url.includes('.') && !url.startsWith('/@') && !url.startsWith('/node_modules')) {
          req.url = '/index.html' + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '');
        }
        next();
      };
      (server.middlewares as any).stack.unshift({ route: '', handle: handler });
    },
  };
}

export default defineConfig({
  plugins: [spaFallback(), react()],
});
