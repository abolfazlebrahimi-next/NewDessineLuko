// ساخت فایل HTML تکیِ قابل‌نمایش (Luko-Game.html):
// همه‌ی عکس‌ها، مدل‌های سه‌بعدی و فونت‌ها به‌صورت data-URI داخل خود فایل گذاشته می‌شوند
// تا با دوبار کلیک در مرورگر باز شود و بشود برای بقیه فرستاد.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
};
const dataUri = (file) =>
  `data:${MIME[extname(file).toLowerCase()]};base64,${readFileSync(file).toString('base64')}`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// نقشه‌ی دارایی‌ها: 'assets/coin.png' و 'models/...' → data-URI (فونت‌ها جدا در CSS می‌نشینند)
const map = {};
for (const file of walk('public')) {
  const rel = relative('public', file).split('\\').join('/');
  if (rel.startsWith('fonts/')) continue;
  if (!MIME[extname(file).toLowerCase()]) continue;
  map[rel] = dataUri(file);
}
const fonts = {};
for (const file of walk('public/fonts')) {
  if (file.endsWith('.woff2')) fonts[basename(file)] = dataUri(file);
}

let html = readFileSync('dist-single/index.html', 'utf-8');

// پری‌لود فونت دیگر لازم نیست (فونت داخل CSS است)
html = html.replace(/<link rel="preload"[^>]*fonts\/[^>]*>/g, '');
// فونت‌های داخل CSS
html = html.replace(/url\(\s*(['"]?)(?:\.\.\/|\.\/|\/)?fonts\/([^'")]+)\1\s*\)/g,
  (m, q, name) => (fonts[name] ? `url(${fonts[name]})` : m));
// عکس‌های استاتیک خود index (لودینگ و فاوآیکون)
html = html.replace(/(src|href)="(assets\/[^"]+)"/g,
  (m, attr, path) => (map[path] ? `${attr}="${map[path]}"` : m));
// نقشه‌ی دارایی‌ها باید قبل از اجرای ماژول بازی آماده باشد
html = html.replace('</head>', `<script>window.__ASSET_MAP__=${JSON.stringify(map)};</script>\n</head>`);

// بررسی نهایی: هیچ ارجاع بیرونی نباید مانده باشد
const leftovers = [
  [/src="assets\//, 'src="assets/'],
  [/href="fonts\//, 'href="fonts/'],
  [/url\((['"]?)(\.\.\/|\.\/|\/)?fonts\//, 'url(fonts/...)'],
  [/<script[^>]+src="http/, 'script خارجی'],
  [/<link[^>]+href="http/, 'link خارجی'],
].filter(([re]) => re.test(html)).map(([, name]) => name);
if (leftovers.length) {
  console.error('⚠️ ارجاع بیرونی باقی مانده:', leftovers.join('، '));
  process.exit(1);
}

writeFileSync('Luko-Game.html', html);
console.log(`✓ Luko-Game.html ساخته شد — ${(html.length / 1048576).toFixed(1)}MB، ${Object.keys(map).length} دارایی + ${Object.keys(fonts).length} فونت داخلی`);
