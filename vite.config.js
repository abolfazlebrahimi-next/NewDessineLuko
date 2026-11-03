import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// public/games پیوند به بازی‌های پروژه‌ی اصلی است و فقط برای dev لازم است؛ روی سرور بازی‌ها از
// همان /games/ِ سایتِ اصلی با لینکِ امضاشده‌ی سرور باز می‌شوند. پس در بیلد کپی نمی‌شوند (۸۸ مگابایت).
const dropDevGames = {
  name: 'luko-drop-dev-games',
  apply: 'build',
  closeBundle() { rmSync(resolve('dist/games'), { recursive: true, force: true }); },
};

export default defineConfig({
  base: './',
  plugins: [dropDevGames],
  // main.js پیش از ساختنِ شهر منتظرِ حساب می‌ماند (top-level await)
  build: { target: 'es2022' },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    allowedHosts: true,
    // بک‌اندِ لوکو (جنگو) روی ۸۰۰۰؛ روی سرور nginx همین کار را می‌کند (هم‌ریشه، بی CORS)
    proxy: {
      '/api': { target: process.env.LUKO_API || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': { target: process.env.LUKO_API || 'http://127.0.0.1:8000', changeOrigin: true },
      // بازی‌ها روی سرور از /games/ِ سایتِ اصلی می‌آیند؛ این‌جا از جنگوی محلی نیستند، پس از dev
      '/games': { target: 'http://127.0.0.1:5173', changeOrigin: true },
    },
  },
});
