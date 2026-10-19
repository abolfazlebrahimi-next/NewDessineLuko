// بیلد تک‌فایل: کل بازی (JS + CSS) داخل یک HTML می‌رود؛
// بعد اسکریپت scripts/make-single.mjs مدل‌ها، عکس‌ها و فونت‌ها را هم داخل همان فایل می‌گذارد.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    modulePreload: false,
  },
});
