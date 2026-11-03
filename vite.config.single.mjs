// بیلد تک‌فایل: کل بازی (JS + CSS) داخل یک HTML می‌رود؛
// بعد اسکریپت scripts/make-single.mjs مدل‌ها، عکس‌ها و فونت‌ها را هم داخل همان فایل می‌گذارد.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    target: 'es2022',
    // make-single دارایی‌ها را مستقیم از public می‌خواند؛ کپیِ public (با ۸۸ مگابایت بازی) فقط دیسک را پر می‌کرد
    copyPublicDir: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    modulePreload: false,
  },
});
