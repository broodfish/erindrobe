const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'fashion');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'fashion-web');
const MOTION_DIR = path.join(__dirname, '..', 'assets', 'fashion-motion');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(MOTION_DIR, { recursive: true });

function canonicalWebPath(rel) {
  const base = path.basename(rel).replace(/\.\w+$/u, '');
  const candidate = `assets/fashion-web/${base}.webp`;
  return fs.existsSync(path.join(__dirname, '..', candidate)) ? candidate : rel;
}

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
    const newMotion = [];
    const sourceImages = item.galleryImages?.length
      ? item.galleryImages
      : (item.cardImages || item.images || []);
    for (const [index, rel] of (item.localImages || []).entries()) {
      const srcPath = path.join(__dirname, '..', rel);
      const base = path.basename(rel).replace(/\.\w+$/, '');
      const destRel = `assets/fashion-web/${base}.webp`;
      const destPath = path.join(__dirname, '..', destRel);
      const isAnimated = /\.gif(?:\?|$)/iu.test(sourceImages[index] || '')
        || path.extname(srcPath).toLowerCase() === '.gif';
      const motionExtension = path.extname(srcPath).toLowerCase() === '.gif' ? '.gif' : '.webp';
      const motionRel = isAnimated ? `assets/fashion-motion/${base}${motionExtension}` : null;
      const motionPath = motionRel ? path.join(__dirname, '..', motionRel) : null;
      try {
        const srcSize = fs.statSync(srcPath).size;
        if (processedSources.get(destPath) === srcPath && fs.existsSync(destPath)) {
          newLocal.push(destRel);
          newMotion.push(motionRel);
          continue;
        }
        // Always regenerate: the same logical filename can point at a different remote image
        // after a split notice is re-mapped or a source gallery is corrected.
        if (motionPath && srcPath !== motionPath) fs.copyFileSync(srcPath, motionPath);
        // Keep a crisp still image for cards and save animated previews separately for the
        // lightbox. Cards should not download every frame just to show their small image.
        await sharp(srcPath)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 82, effort: 5 })
          .toFile(destPath);
        processedSources.set(destPath, srcPath);
        const destSize = fs.statSync(destPath).size;
        before += srcSize;
        after += destSize + (motionPath && fs.existsSync(motionPath) ? fs.statSync(motionPath).size : 0);
        newLocal.push(destRel);
        newMotion.push(motionRel);
        process.stdout.write(`\r${base}: ${(srcSize/1024).toFixed(0)}KB -> ${(destSize/1024).toFixed(0)}KB`.padEnd(60));
      } catch (e) {
        console.error(`\nFailed ${rel}:`, e.message);
        newLocal.push(rel);
        newMotion.push(null);
      }
    }
    item.localImages = newLocal;
    if (newMotion.some(Boolean)) item.motionImages = newMotion;
    else delete item.motionImages;
  }
  console.log('');
  if (requestedIds) {
    const rebuiltById = new Map(items.map(item => [item.id, item]));
    allItems.forEach((item, index) => {
      if (rebuiltById.has(item.id)) allItems[index] = rebuiltById.get(item.id);
    });
  }
  allItems.forEach(item => {
    if (Array.isArray(item.localImages)) item.localImages = item.localImages.map(canonicalWebPath);
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), JSON.stringify(allItems, null, 2));
  console.log(`Total: ${(before/1024/1024).toFixed(1)}MB -> ${(after/1024/1024).toFixed(1)}MB`);
})();
