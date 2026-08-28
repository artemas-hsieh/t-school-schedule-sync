import { defineConfig } from 'vite';

const PRODUCTION_CONNECT_SRC =
  "connect-src https://script.google.com https://script.googleusercontent.com";
const DEVELOPMENT_CONNECT_SRC =
  "connect-src 'self' ws: https://script.google.com https://script.googleusercontent.com";

export default defineConfig(({ command }) => ({
  plugins: command === 'serve'
    ? [
        {
          name: 'tschool-static-dev-reload',
          transformIndexHtml(html) {
            return html.replace(PRODUCTION_CONNECT_SRC, DEVELOPMENT_CONNECT_SRC);
          },
          handleHotUpdate({ file, server }) {
            if (file.endsWith('.js')) {
              server.ws.send({ type: 'full-reload', path: '*' });
              return [];
            }
          }
        }
      ]
    : []
}));
