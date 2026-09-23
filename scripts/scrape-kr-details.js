// Fetch detail pages for candidate KR notice/event IDs and extract content images + text.
const fs = require('fs');
const path = require('path');

const BASE = 'https://mabinogimobile.nexon.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Filename substrings that indicate site-chrome / template images, not real content.
const CHROME_BLOCKLIST = [
  '관리자프로필이미지', '상단배너', '게시글하단푸터', '공식홈페이지플로팅배너',
  '상점안내', '프로필이미지', 'default', 'favicon', 'banner108x241', '푸터',
];

function isContentImage(url) {
  const decoded = decodeURIComponent(url);
  if (!decoded.includes('cloudfront.net/community/')) return false;
  return !CHROME_BLOCKLIST.some(bad => decoded.includes(bad));
}

async function fetchDetail(id, boardPath) {
  const url = `${BASE}${boardPath}/${id}`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const contentImages = [...new Set(imgs.filter(isContentImage))];

  // Extract plain text of the thread content area if identifiable, else whole body stripped.
  let text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to isolate the actual post title + body (best-effort: look for known marker text)
  const titleM = html.match(/<title>([^<]+)<\/title>/);
  const dateM = html.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})/);

  return {
    id,
    url,
    pageTitle: titleM ? titleM[1].trim() : null,
    exactDate: dateM ? dateM[1] : null,
    contentImages,
    textPreview: text.slice(0, 4000),
  };
}

(async () => {
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'raw', 'kr-candidates.json'), 'utf8'));
  const outDir = path.join(__dirname, '..', 'data', 'raw', 'details');
  fs.mkdirSync(outDir, { recursive: true });

  const jobs = [
    ...candidates.notice.map(i => ({ ...i, boardPath: '/News/Notice' })),
    ...candidates.events.map(i => ({ ...i, boardPath: '/News/Events' })),
  ];

  console.log(`Fetching ${jobs.length} detail pages...`);
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const detail = await fetchDetail(job.id, job.boardPath);
      results.push({ ...job, ...detail });
      process.stdout.write(`\r[${i + 1}/${jobs.length}] id=${job.id} images=${detail.contentImages.length}`.padEnd(70));
    } catch (e) {
      console.error(`\nFailed ${job.id}:`, e.message);
      results.push({ ...job, error: e.message });
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('');
  fs.writeFileSync(path.join(outDir, '..', 'kr-details.json'), JSON.stringify(results, null, 2));
  console.log('DONE, saved', results.length, 'detail records');
})();
