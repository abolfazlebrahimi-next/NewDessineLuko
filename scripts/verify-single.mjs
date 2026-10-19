// راستی‌آزمایی فایل تکی: ماژول و JSON دارایی‌ها را از خود Luko-Game.html بیرون می‌کشد
// و با همان استاب‌های tests/test-boot.mjs بوت می‌کند تا معلوم شود در حالت تک‌فایل بالا می‌آید.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const html = readFileSync('Luko-Game.html', 'utf-8');
const mod = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
const jsonTag = html.match(/<script type="application\/json" id="luko-assets">([\s\S]*?)<\/script>/);
if (!mod || !jsonTag) { console.error('✗ ساختار فایل تکی ناقص است (ماژول یا JSON پیدا نشد)'); process.exit(1); }

const loadingPos = html.indexOf('id="loading"');
const dataPos = html.indexOf('id="luko-assets"');
if (!(loadingPos > -1 && dataPos > loadingPos)) {
  console.error('✗ داده‌های سنگین قبل از صفحه‌ی لودینگ‌اند — صفحه سفید می‌دهد');
  process.exit(1);
}
const map = JSON.parse(jsonTag[1]);
console.log(`JSON دارایی‌ها: ${Object.keys(map).length} فایل، ترتیب لودینگ قبل از داده‌ها ✓`);

writeFileSync('tests/tmp-single-bundle.mjs', mod[1]);
writeFileSync('tests/tmp-single-map.json', jsonTag[1]);

let bootSrc = readFileSync('tests/test-boot.mjs', 'utf-8');
bootSrc = bootSrc.replace("await import('../src/main.js')", "await import('./tmp-single-bundle.mjs')");
bootSrc = bootSrc.replace(
  'global.PointerEvent = window.MouseEvent;',
  'global.PointerEvent = window.MouseEvent;\nglobal.MutationObserver = window.MutationObserver;\nglobal.ProgressEvent = window.ProgressEvent;\nglobal.ImageBitmap = window.ImageBitmap;'
);
const generated =
  `import { readFileSync as _rfs } from 'node:fs';\n` +
  `globalThis.__ASSET_MAP__ = JSON.parse(_rfs(new URL('./tmp-single-map.json', import.meta.url), 'utf-8'));\n` +
  bootSrc +
  `\nconsole.log(window.__LUKO_BOOTED__ ? 'VERIFY-BOOTED' : 'VERIFY-NOT-BOOTED');\n`;
writeFileSync('tests/tmp-single-boot.mjs', generated);

let out = '';
let code = 0;
try {
  out = execFileSync('node', ['tests/tmp-single-boot.mjs'], { encoding: 'utf-8', timeout: 120000 });
} catch (e) {
  code = e.status ?? 1;
  out = (e.stdout || '') + (e.stderr || '');
} finally {
  for (const f of ['tests/tmp-single-bundle.mjs', 'tests/tmp-single-map.json', 'tests/tmp-single-boot.mjs']) {
    try { rmSync(f); } catch (_) { /* ok */ }
  }
}
console.log(out.trim());
const ok = code === 0 && out.includes('VERIFY-BOOTED') && out.includes('(بدون خطا)');
console.log(ok ? '✓ فایل تکی سالم بوت شد' : '✗ فایل تکی مشکل دارد');
process.exit(ok ? 0 : 1);
