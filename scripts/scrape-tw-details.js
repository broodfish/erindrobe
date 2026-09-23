const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME_BLOCKLIST = [
  'forum_NEXON', 'profile_default', 'favicon', 'default_thumb', 'gnb', 'footer',
];
function isContentImage(url) {
  if (!url.includes('cloudfront.net')) return false;
  return !CHROME_BLOCKLIST.some(bad => url.includes(bad));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-TW',
  });
  const page = await context.newPage();
  await page.goto('https://tw.nexon.com/mabinogimobile/home/news/notice/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1000);

  const outDir = path.join(__dirname, '..', 'data', 'raw');
  const notice = JSON.parse(fs.readFileSync(path.join(outDir, 'tw-notice-product.json'), 'utf8'));
  const noticeAll = JSON.parse(fs.readFileSync(path.join(outDir, 'tw-notice-all.json'), 'utf8'));
  const eventAll = JSON.parse(fs.readFileSync(path.join(outDir, 'tw-event-all.json'), 'utf8'));

  // Merge unique threads: product-tagged notices are priority; also include any notice/event title containing fashion keywords
  const KW = ['時裝', '套組', '幸運箱', '通行證', '造型', '聯名', '合作', '染色', '寵物', '坐騎'];
  const extra = [...noticeAll, ...eventAll].filter(i => KW.some(k => i.title && i.title.includes(k)));
  const map = new Map();
  [...notice, ...extra].forEach(i => map.set(i.threadId, i));
  const jobs = [...map.values()];
  console.log('total detail jobs:', jobs.length);

  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    try {
      const detail = await page.evaluate(async ({ threadId }) => {
        const res = await fetch(`/mabinogimobile/api/content/community/threads/${threadId}/`, { headers: { Accept: 'application/json' } });
        return res.json();
      }, { threadId: j.threadId });
      const content = detail.data && (detail.data.content || detail.data.contentHtml || '');
      const imgs = [...content.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(isContentImage);
      results.push({
        threadId: j.threadId,
        boardId: j.boardId,
        headlineId: j.headlineId,
        title: j.title,
        createDate: j.createDate,
        images: [...new Set(imgs)],
      });
      process.stdout.write(`\r[${i + 1}/${jobs.length}] ${j.threadId} images=${imgs.length}`.padEnd(60));
    } catch (e) {
      console.error(`\nFailed ${j.threadId}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('');
  fs.writeFileSync(path.join(outDir, 'tw-details.json'), JSON.stringify(results, null, 2));
  console.log('DONE saved', results.length);
  await browser.close();
})();
