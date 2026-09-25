const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const outputDir = path.join(root, 'assets', 'fashion-thumb');
fs.mkdirSync(outputDir, { recursive: true });

const allItems = JSON.parse(fs.readFileSync(path.join(root, 'data', 'fashion.json'), 'utf8'));
const requestedIds = process.env.MBC_IMAGE_IDS
  ? new Set(process.env.MBC_IMAGE_IDS.split(',').map(id => id.trim()).filter(Boolean))
  : null;
const items = requestedIds ? allItems.filter(item => requestedIds.has(item.id)) : allItems;

(async () => {
  const sources = new Set(items.flatMap(item => item.localImages || []));
  let processed = 0;
  let totalBytes = 0;

  for (const rel of sources) {
    const sourcePath = path.join(root, rel);
    const base = path.basename(rel).replace(/\.\w+$/u, '');
    const outputPath = path.join(outputDir, `${base}.webp`);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Missing source image: ${rel}`);
      continue;
    }
    await sharp(sourcePath)
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 74, effort: 5 })
      .toFile(outputPath);
    processed += 1;
    totalBytes += fs.statSync(outputPath).size;
  }

  console.log(`Generated ${processed} thumbnails (${(totalBytes / 1024 / 1024).toFixed(1)}MB).`);
})();
