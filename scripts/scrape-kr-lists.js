// Fetch all list pages for KR mabinogimobile.nexon.com News boards and save raw item lists.
const fs = require('fs');
const path = require('path');

const BASE = 'https://mabinogimobile.nexon.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOARDS = [
  { key: 'notice-info', path: '/News/Notice', headlineId: 2497 }, // 안내
  { key: 'notice-done', path: '/News/Notice', headlineId: 2499 }, // 완료 (expired sale notices — likely where weekly fashion/lucky box notices land)
  { key: 'notice-major', path: '/News/Notice', headlineId: 4204 }, // 주요상품
  { key: 'update', path: '/News/Update', headlineId: null }, // all patch notes
  { key: 'events-past', path: '/News/Events', headlineId: 2502 }, // 지난이벤트
  { key: 'events-all', path: '/News/Events', headlineId: 0 }, // 전체 (catch ongoing + any gap between past/now)
];

async function fetchHtml(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

function parseList(html) {
  const totalM = html.match(/data-totalcount="(\d+)"/);
  const totalcount = totalM ? parseInt(totalM[1], 10) : null;
  const blockNoM = html.match(/data-blockstartno="(\d+)"/);
  const blockKeyM = html.match(/data-blockstartkey="([^"]+)"/);
  const blockStartNo = blockNoM ? blockNoM[1] : '1';
  const blockStartKey = blockKeyM ? blockKeyM[1] : '253402300799,9223372036854775807';

  const items = [];
  // Each regular list item: <li class="item " data-mm-listitem data-threadid="ID">
  //   <div class="type"><span>CATEGORY</span></div>
  //   <a href='...' ...><span>TITLE</span></a>
  //   ... later somewhere: <div class="date"><span>YYYY.MM.DD</span></div>
  const liRe = /<li class="item[^"]*"\s+data-mm-listitem\s+data-threadid="(\d+)">([\s\S]*?)<\/li>\s*(?=<li class="item|<\/ul>)/g;
  let m;
  while ((m = liRe.exec(html))) {
    const id = m[1];
    const block = m[2];
    const catM = block.match(/<div class="type"><span>([^<]*)<\/span><\/div>/);
    const titleM = block.match(/<span>([^<]+)<\/span>\s*<\/a>/);
    const dateM = block.match(/(\d{4}\.\d{2}\.\d{2})/);
    items.push({
      id,
      category: catM ? catM[1].trim() : null,
      title: titleM ? titleM[1].trim() : null,
      date: dateM ? dateM[1] : null,
    });
  }
  return { totalcount, items, blockStartNo, blockStartKey };
}

function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    if (!seen.has(it.id)) seen.set(it.id, it);
  }
  return [...seen.values()];
}

async function scrapeBoard(board) {
  const qs = board.headlineId ? `?headlineId=${board.headlineId}` : '';
  const firstUrl = `${BASE}${board.path}${qs}`;
  const firstHtml = await fetchHtml(firstUrl);
  const { totalcount, items: firstItems, blockStartNo: firstBSN, blockStartKey: firstBSK } = parseList(firstHtml);
  const perPage = firstItems.length;
  console.log(`[${board.key}] totalcount=${totalcount} perPage=${perPage}`);
  let all = [...firstItems];
  let blockStartNo = firstBSN;
  let blockStartKey = firstBSK;
  if (totalcount && perPage) {
    const totalPages = Math.ceil(totalcount / perPage);
    for (let pageno = 2; pageno <= totalPages; pageno++) {
      const sep = qs ? '&' : '?';
      const url = `${BASE}${board.path}${qs}${sep}pageno=${pageno}&blockStartNo=${blockStartNo}&blockStartKey=${encodeURIComponent(blockStartKey)}`;
      try {
        const html = await fetchHtml(url);
        const parsed = parseList(html);
        all.push(...parsed.items);
        blockStartNo = parsed.blockStartNo;
        blockStartKey = parsed.blockStartKey;
        process.stdout.write(`\r[${board.key}] page ${pageno}/${totalPages} (+${parsed.items.length})`.padEnd(60));
      } catch (e) {
        console.error(`\n[${board.key}] page ${pageno} failed:`, e.message);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    console.log('');
  }
  return dedupe(all);
}

(async () => {
  const outDir = path.join(__dirname, '..', 'data', 'raw');
  fs.mkdirSync(outDir, { recursive: true });
  for (const board of BOARDS) {
    const items = await scrapeBoard(board);
    fs.writeFileSync(path.join(outDir, `kr-${board.key}.json`), JSON.stringify(items, null, 2));
    console.log(`[${board.key}] saved ${items.length} items`);
  }
  console.log('DONE');
})();
