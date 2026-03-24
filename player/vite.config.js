import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
function spaFallback() {
    return {
        name: 'spa-fallback',
        configureServer: function (server) {
            var handler = function (req, res, next) {
                var _a, _b, _c;
                var url = (_b = (_a = req.url) === null || _a === void 0 ? void 0 : _a.split('?')[0]) !== null && _b !== void 0 ? _b : '';
                if (url !== '/' && !url.includes('.') && !url.startsWith('/@') && !url.startsWith('/node_modules')) {
                    req.url = '/index.html' + (((_c = req.url) === null || _c === void 0 ? void 0 : _c.includes('?')) ? '?' + req.url.split('?')[1] : '');
                }
                next();
            };
            server.middlewares.stack.unshift({ route: '', handle: handler });
        },
    };
}
export default defineConfig({
    plugins: [spaFallback(), react()],
});
