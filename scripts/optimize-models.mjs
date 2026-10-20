// فشرده‌سازی مدل‌های GLB (Kenney) برای لود سریع‌تر شهر
// - بافت colormap داخل خود فایل می‌رود (دیگر به پوشه‌ی Textures نیازی نیست)
// - هندسه با Meshopt + کوانتیزه فشرده می‌شود (۵ تا ۷ برابر کوچک‌تر)
// - اسم نودها (مثل چرخ ماشین‌ها) دست‌نخورده می‌ماند
//
// استفاده:  node scripts/optimize-models.mjs public/models/city public/models/cars ...
// (اگر پوشه‌ای ندهی همه‌ی پوشه‌های public/models را می‌گیرد)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const dirs = process.argv.slice(2);
if (!dirs.length) {
  for (const n of readdirSync('public/models')) {
    const p = join('public/models', n);
    if (statSync(p).isDirectory()) dirs.push(p);
  }
}

let before = 0, after = 0, count = 0;
for (const dir of dirs) {
  if (!existsSync(dir)) { console.warn('پوشه نیست:', dir); continue; }
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.glb')) continue;
    const file = join(dir, name);
    const size0 = statSync(file).size;
    try {
      const doc = await io.read(file);
      await doc.transform(
        dedup(),
        prune(),
        weld(),
        quantize(),
        reorder({ encoder: MeshoptEncoder }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
      );
      await io.write(file, doc);
    } catch (e) {
      console.warn('✗', file, e.message);
      continue;
    }
    const size1 = statSync(file).size;
    before += size0; after += size1; count++;
    console.log(`${file}: ${(size0 / 1024).toFixed(0)}KB → ${(size1 / 1024).toFixed(0)}KB`);
  }
}
console.log(`✓ ${count} مدل — ${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB`);
