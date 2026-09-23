const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'fashion');
fs.mkdirSync(OUT_DIR, { recursive: true });

const items = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), 'utf8'));

function pickImages(images, max = 4) {
  const banner = images.filter(u => /\d{3,4}x\d{3,4}/.test(decodeURIComponent(u)));
  const rest = images.filter(u => !banner.includes(u));
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
  for (const item of items) {
    const selected = pickImages(item.images);
    item.localImages = [];
    for (let i = 0; i < selected.length; i++) {
      const url = selected[i];
      const ext = extFromUrl(url);
      const filename = `${item.id}_${i}.${ext}`;
      const dest = path.join(OUT_DIR, filename);
      try {
        if (!fs.existsSync(dest)) {
          const size = await download(url, dest);
          total++;
          process.stdout.write(`\r[${total}] ${filename} (${(size / 1024).toFixed(0)}KB)`.padEnd(60));
        } else {
          process.stdout.write(`\rskip existing ${filename}`.padEnd(60));
        }
        item.localImages.push(`assets/fashion/${filename}`);
      } catch (e) {
        console.error(`\nFailed ${url}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 80));
    }
  }
  console.log('');
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'fashion.json'), JSON.stringify(items, null, 2));
  console.log('Downloaded', total, 'images. Updated fashion.json with localImages.');
})();
