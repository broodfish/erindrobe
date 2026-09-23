// Download raw TW images for specific fashion-bundle threads so subagents can vision-read them.
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'raw', 'tw-images');
fs.mkdirSync(OUT_DIR, { recursive: true });

const THREAD_IDS = ['3505035', '3504945', '3527227', '3531554', '3541055', '3541044'];

const tw = require('../data/raw/tw-details.json');

function extFromUrl(u) {
  const m = u.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'png';
}

(async () => {
  let total = 0;
  const manifest = [];
  for (const id of THREAD_IDS) {
    const t = tw.find(x => x.threadId === id);
    if (!t) continue;
    for (let i = 0; i < t.images.length; i++) {
      const url = t.images[i];
      const ext = extFromUrl(url);
      if (ext === 'gif') continue; // skip animated pose gifs, not useful for name identification
      const filename = `${id}_${i}.${ext}`;
      const dest = path.join(OUT_DIR, filename);
      manifest.push({ threadId: id, title: t.title, createDate: t.createDate, index: i, file: `data/raw/tw-images/${filename}`, url });
      if (fs.existsSync(dest)) continue;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(dest, buf);
        total++;
        process.stdout.write(`\r[${total}] ${filename}`.padEnd(50));
      } catch (e) {
        console.error(`\nFailed ${url}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 80));
    }
  }
  console.log('');
  fs.writeFileSync(path.join(OUT_DIR, '..', 'tw-image-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Downloaded', total, 'new images. Manifest has', manifest.length, 'entries (gifs excluded).');
})();
