const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'fashion');
fs.mkdirSync(OUT_DIR, { recursive: true });

const allItems = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), 'utf8'));
const requestedIds = process.env.MBC_IMAGE_IDS
  ? new Set(process.env.MBC_IMAGE_IDS.split(',').map(id => id.trim()).filter(Boolean))
  : null;
const items = requestedIds ? allItems.filter(item => requestedIds.has(item.id)) : allItems;

function pickImages(images, max = Number.POSITIVE_INFINITY) {
  // Exclude animated .gif "showcase spin" clips from broad notice fallbacks. Reviewed product
  // galleries can keep them; the optimizer stores a still poster separately from the motion file.
  const stills = images.filter(u => !/\.gif(\?|$)/i.test(u));
  const banner = stills.filter(u => /\d{3,4}x\d{3,4}/.test(decodeURIComponent(u)));
  const rest = stills.filter(u => !banner.includes(u));
  return [...banner, ...rest].slice(0, max);
}

function extFromUrl(u) {
  const m = u.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'png';
}

async function download(url, destPath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

(async () => {
  let total = 0;
  const remoteToLocal = new Map();
  for (const item of items) {
    const sourceImages = item.galleryImages?.length ? item.galleryImages : (item.cardImages ?? item.images);
    // A reviewed gallery is already scoped to the intended product. Preserve animated previews
    // in that explicit gallery; broad notice-level fallbacks still use the static-image filter.
    const selected = sourceImages?.some(url => /\.gif(?:\?|$)/iu.test(url))
      ? sourceImages
      : pickImages(sourceImages || []);
    item.localImages = [];
    for (let i = 0; i < selected.length; i++) {
      const url = selected[i];
      const sharedLocal = remoteToLocal.get(url);
      if (sharedLocal) {
        item.localImages.push(sharedLocal);
        continue;
      }
      const ext = extFromUrl(url);
      const filename = `${item.id}_${i}.${ext}`;
      const dest = path.join(OUT_DIR, filename);
      try {
        // Re-fetch on every explicit image build. A split notice can change which remote image
        // occupies a stable `${item.id}_${index}` filename after the dataset is reclassified;
        // keeping an old file here silently restores the wrong card image.
        const size = await download(url, dest);
        total++;
        process.stdout.write(`\r[${total}] ${filename} (${(size / 1024).toFixed(0)}KB)`.padEnd(60));
        const localPath = `assets/fashion/${filename}`;
        remoteToLocal.set(url, localPath);
        item.localImages.push(localPath);
      } catch (e) {
        console.error(`\nFailed ${url}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 80));
    }
  }
  console.log('');
  if (requestedIds) {
    const rebuiltById = new Map(items.map(item => [item.id, item]));
    allItems.forEach((item, index) => {
      if (rebuiltById.has(item.id)) allItems[index] = rebuiltById.get(item.id);
    });
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), JSON.stringify(allItems, null, 2));
  console.log('Downloaded', total, 'images. Updated fashion.json with localImages.');
})();
