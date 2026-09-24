const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'fashion');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'fashion-web');
fs.mkdirSync(OUT_DIR, { recursive: true });

const allItems = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), 'utf8'));
const requestedIds = process.env.MBC_IMAGE_IDS
  ? new Set(process.env.MBC_IMAGE_IDS.split(',').map(id => id.trim()).filter(Boolean))
  : null;
const items = requestedIds ? allItems.filter(item => requestedIds.has(item.id)) : allItems;

(async () => {
  let before = 0, after = 0;
  const processedSources = new Map();
  for (const item of items) {
    const newLocal = [];
    for (const rel of item.localImages || []) {
      const srcPath = path.join(__dirname, '..', rel);
      const base = path.basename(rel).replace(/\.\w+$/, '');
      const destRel = `assets/fashion-web/${base}.webp`;
      const destPath = path.join(__dirname, '..', destRel);
      try {
        const srcSize = fs.statSync(srcPath).size;
        if (processedSources.get(destPath) === srcPath && fs.existsSync(destPath)) {
          newLocal.push(destRel);
          continue;
        }
        // Always regenerate: the same logical filename can point at a different remote image
        // after a split notice is re-mapped or a source gallery is corrected.
        await sharp(srcPath, { animated: true })
          .resize({ width: 800, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(destPath);
        processedSources.set(destPath, srcPath);
        const destSize = fs.statSync(destPath).size;
        before += srcSize; after += destSize;
        newLocal.push(destRel);
        process.stdout.write(`\r${base}: ${(srcSize/1024).toFixed(0)}KB -> ${(destSize/1024).toFixed(0)}KB`.padEnd(60));
      } catch (e) {
        console.error(`\nFailed ${rel}:`, e.message);
        newLocal.push(rel);
      }
    }
    item.localImages = newLocal;
  }
  console.log('');
  if (requestedIds) {
    const rebuiltById = new Map(items.map(item => [item.id, item]));
    allItems.forEach((item, index) => {
      if (rebuiltById.has(item.id)) allItems[index] = rebuiltById.get(item.id);
    });
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), JSON.stringify(allItems, null, 2));
  console.log(`Total: ${(before/1024/1024).toFixed(1)}MB -> ${(after/1024/1024).toFixed(1)}MB`);
})();
