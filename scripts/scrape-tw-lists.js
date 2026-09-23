const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-TW',
  });
  const page = await context.newPage();
  await page.goto('https://tw.nexon.com/mabinogimobile/home/news/notice/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1000);

  async function fetchThreads(boardId, headlineId, pageNo, blockStartNo, blockStartKey, pageSize = 20) {
    return page.evaluate(async ({ boardId, headlineId, pageNo, pageSize, blockStartNo, blockStartKey }) => {
      const qs = new URLSearchParams({ paginationType: 'PAGING', pageSize: String(pageSize), pageNo: String(pageNo) });
      if (headlineId) qs.set('headlineId', String(headlineId));
      if (blockStartNo) qs.set('blockStartNo', String(blockStartNo));
      if (blockStartKey) qs.set('blockStartKey', blockStartKey.join(','));
      const res = await fetch(`/mabinogimobile/api/content/community/boards/${boardId}/threads/?${qs.toString()}`, { headers: { Accept: 'application/json' } });
      return res.json();
    }, { boardId, headlineId, pageNo, pageSize, blockStartNo, blockStartKey });
  }

  const outDir = path.join(__dirname, '..', 'data', 'raw');
  fs.mkdirSync(outDir, { recursive: true });

  const targets = [
    { key: 'tw-notice-all', boardId: 7125, headlineId: null },
    { key: 'tw-event-all', boardId: 7126, headlineId: null },
    { key: 'tw-update-all', boardId: 7127, headlineId: null },
  ];

  for (const t of targets) {
    let pageNo = 1;
    let all = [];
    let total = null;
    let blockStartNo = null;
    let blockStartKey = null;
    do {
      const resp = await fetchThreads(t.boardId, t.headlineId, pageNo, blockStartNo, blockStartKey);
      const data = resp.data || {};
      const list = data.threads || [];
      if (total === null) total = parseInt(data.totalElements, 10) || 0;
      all.push(...list);
      blockStartNo = data.blockStartNo;
      blockStartKey = data.blockStartKey;
      process.stdout.write(`\r[${t.key}] page ${pageNo} (+${list.length}) total=${total} got=${all.length}`.padEnd(70));
      if (list.length === 0) break;
      pageNo++;
      await new Promise(r => setTimeout(r, 150));
    } while (all.length < total && pageNo <= 50);
    console.log('');
    fs.writeFileSync(path.join(outDir, `${t.key}.json`), JSON.stringify(all, null, 2));
    console.log(`[${t.key}] saved ${all.length} / ${total} items`);
  }

  await browser.close();
})();
