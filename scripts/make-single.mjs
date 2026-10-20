// ساخت فایل HTML تکیِ قابل‌نمایش (Luko-Game.html):
// همه‌ی عکس‌ها، مدل‌های سه‌بعدی و فونت‌ها به‌صورت data-URI داخل خود فایل گذاشته می‌شوند
// تا با دوبار کلیک در مرورگر باز شود و بشود برای بقیه فرستاد.
//
// نکته‌های مهم برای اینکه صفحه سفید/هنگ ندهد:
// ۱) داده‌ی دارایی‌ها آخرِ body و به‌شکل JSON می‌آید تا صفحه‌ی لودینگ فوری رنگ شود
//    و مرورگر مجبور نباشد یک آبجکت JS غول‌پیکر را در head پارس کند.
// ۲) عکس‌های بزرگ فقط برای این بیلد کوچک و فشرده می‌شوند تا فایل سبک بماند.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import sharp from 'sharp';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// عکس را برای بیلد تکی سبک می‌کند: حداکثر بُعد و فشرده‌سازی دوباره
async function imageDataUri(file) {
  const ext = extname(file).toLowerCase();
  const raw = readFileSync(file);
  try {
    const cap = basename(file) === 'grass_tile.png' ? 512 : 640;
    let img = sharp(raw);
    const meta = await img.metadata();
    if (Math.max(meta.width || 0, meta.height || 0) > cap) {
      img = img.resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true });
    }
    const buf = ext === '.png'
      ? await img.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
      : await img.jpeg({ quality: 82 }).toBuffer();
    const use = buf.length < raw.length ? buf : raw;
    return { uri: `data:${MIME[ext]};base64,${use.toString('base64')}`, before: raw.length, after: use.length };
  } catch (e) {
    return { uri: `data:${MIME[ext]};base64,${raw.toString('base64')}`, before: raw.length, after: raw.length };
  }
}

const map = {};
let beforeTotal = 0, afterTotal = 0;
// فقط دارایی‌هایی که محصول فعلی (شهر) استفاده می‌کند وارد فایل تکی می‌شوند
const WANTED_ASSETS = new Set([
  'assets/coin.png', 'assets/Dew.png', 'assets/grass_tile.png',
  'assets/AmusementPark.png', 'assets/Tree2.png',
]);
const wanted = (rel) =>
  rel.startsWith('models/city/') ||
  rel.startsWith('models/cars/') ||
  rel.startsWith('models/suburban/') ||
  rel.startsWith('models/nature/') ||
  rel.startsWith('models/commercial/') ||
  WANTED_ASSETS.has(rel) ||
  /^assets\/city-[^/]+\.(png|webp)$/.test(rel);

for (const file of walk('public')) {
  const rel = relative('public', file).split('\\').join('/');
  if (rel.startsWith('fonts/')) continue;
  if (!wanted(rel)) continue;
  const ext = extname(file).toLowerCase();
  if (!MIME[ext]) continue;
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const r = await imageDataUri(file);
    map[rel] = r.uri;
    beforeTotal += r.before; afterTotal += r.after;
  } else {
    const raw = readFileSync(file);
    map[rel] = `data:${MIME[ext]};base64,${raw.toString('base64')}`;
    beforeTotal += raw.length; afterTotal += raw.length;
  }
}
const fonts = {};
for (const file of walk('public/fonts')) {
  if (file.endsWith('.woff2')) {
    fonts[basename(file)] = `data:font/woff2;base64,${readFileSync(file).toString('base64')}`;
  }
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
// داده‌ی دارایی‌ها: آخر body و به‌شکل JSON — صفحه‌ی لودینگ قبلش رنگ شده است.
// ماژول بازی deferred است و بعد از این اسکریپت کوچک اجرا می‌شود.
const json = JSON.stringify(map).replaceAll('</', '<\\/');
const bootBlock =
  `<script type="application/json" id="luko-assets">${json}</script>\n` +
  `<script>try{window.__ASSET_MAP__=JSON.parse(document.getElementById('luko-assets').textContent)}catch(e){window.__bootError='خواندن داده‌های بازی: '+e.message}</script>\n`;
if (!html.includes('</body>')) { console.error('ساختار HTML غیرمنتظره: </body> نیست'); process.exit(1); }
html = html.replace('</body>', bootBlock + '</body>');

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
console.log(`✓ Luko-Game.html ساخته شد — ${(html.length / 1048576).toFixed(1)}MB`);
console.log(`  دارایی‌ها: ${Object.keys(map).length} فایل — از ${(beforeTotal / 1048576).toFixed(1)}MB به ${(afterTotal / 1048576).toFixed(1)}MB فشرده شد`);
