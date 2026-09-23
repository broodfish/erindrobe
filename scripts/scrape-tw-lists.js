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

  async function fetchBoardMeta(boardId) {
    return page.evaluate(async (boardId) => {
      const res = await fetch(`/mabinogimobile/api/content/community/boards/${boardId}/`, { headers: { Accept: 'application/json' } });
      return res.json();
    }, boardId);
  }

  async function fetchThreads(boardId, headlineId, pageNo, pageSize = 20) {
    return page.evaluate(async ({ boardId, headlineId, pageNo, pageSize }) => {
      const qs = new URLSearchParams({ paginationType: 'PAGING', pageSize: String(pageSize), pageNo: String(pageNo) });
      if (headlineId) qs.set('headlineId', String(headlineId));
      const res = await fetch(`/mabinogimobile/api/content/community/boards/${boardId}/threads/?${qs.toString()}`, { headers: { Accept: 'application/json' } });
      return res.json();
    }, { boardId, headlineId, pageNo, pageSize });
  }

  const outDir = path.join(__dirname, '..', 'data', 'raw');
  fs.mkdirSync(outDir, { recursive: true });

  // Board 7125 = 公告, headline 5332 = 商品
  const targets = [
    { key: 'tw-notice-product', boardId: 7125, headlineId: 5332 },
    { key: 'tw-notice-all', boardId: 7125, headlineId: null },
  ];

  // Discover event board headlines too
  const eventMeta = await fetchBoardMeta(7126);
  console.log('event board headlines:', JSON.stringify(eventMeta.data && eventMeta.data.boardHeadlines));
  fs.writeFileSync(path.join(outDir, 'tw-event-meta.json'), JSON.stringify(eventMeta, null, 2));
  targets.push({ key: 'tw-event-all', boardId: 7126, headlineId: null });

  for (const t of targets) {
    let pageNo = 1;
    let all = [];
    let total = null;
    do {
      const resp = await fetchThreads(t.boardId, t.headlineId, pageNo);
      const data = resp.data || {};
      const list = data.threadList || data.list || data.threads || [];
      if (total === null) total = data.totalCount ?? data.total ?? list.length;
      all.push(...list);
      process.stdout.write(`\r[${t.key}] page ${pageNo} (+${list.length}) total=${total}`.padEnd(60));
      if (list.length === 0) break;
      pageNo++;
      await new Promise(r => setTimeout(r, 150));
    } while (all.length < (total || 0) && pageNo < 100);
    console.log('');
    fs.writeFileSync(path.join(outDir, `${t.key}.json`), JSON.stringify(all, null, 2));
    console.log(`[${t.key}] saved ${all.length} items (raw sample keys: ${all[0] ? Object.keys(all[0]).join(',') : 'none'})`);
  }

  await browser.close();
})();
